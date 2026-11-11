/**
 * Client for a locally running ACE-Step 1.5 API server (`uv run acestep-api`, default
 * http://127.0.0.1:8001). Generation is asynchronous on the server: submit a task, poll
 * for its result, then download the audio file it names.
 */

interface Envelope<T> {
  data: T;
  code: number;
  error: string | null;
}

export interface AceStepTaskInput {
  prompt: string;
  lyrics: string;
  durationSeconds?: number | null;
}

export interface AceStepAudioResult {
  /** Server-relative URL of the audio file, e.g. `/v1/audio?path=...`. */
  fileUrl: string;
  durationSeconds: number | null;
  model: string | null;
}

export interface AceStepPollResult {
  state: 'running' | 'succeeded' | 'failed';
  progress: number;
  stage: string;
  error: string | null;
  results: AceStepAudioResult[];
}

function friendlyUnreachableError(baseUrl: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`Couldn't reach ACE-Step at ${baseUrl} -- is its API server running? Start it from the Audio tab or Settings. (${detail})`);
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, init);
  } catch (err) {
    throw friendlyUnreachableError(baseUrl, err);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ACE-Step request failed (${res.status}): ${body || res.statusText}`);
  }
  const envelope = (await res.json()) as Envelope<T>;
  if (envelope.error) {
    throw new Error(`ACE-Step error: ${envelope.error}`);
  }
  return envelope.data;
}

function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  return request<T>(baseUrl, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function aceStepHealth(baseUrl: string): Promise<void> {
  await request<unknown>(baseUrl, '/health');
}

export async function aceStepSubmit(baseUrl: string, input: AceStepTaskInput): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    lyrics: input.lyrics,
    // Let the server's language model plan the arrangement (and fill in tempo/key/length
    // the user didn't specify). Ignored by servers started without the LM.
    thinking: true,
    // The server's default is 2 variations per request; one take per click keeps the
    // wait short and the takes list in the user's hands.
    batch_size: 1,
    // FLAC, not the server's default MP3: its MP3 export needs ffmpeg on the PATH and
    // otherwise "succeeds" with no file at all. FLAC is written natively.
    audio_format: 'flac',
  };
  if (input.durationSeconds) body.audio_duration = input.durationSeconds;

  const data = await postJson<{ task_id?: string }>(baseUrl, '/release_task', body);
  if (!data?.task_id) throw new Error('ACE-Step did not return a task id.');
  return data.task_id;
}

interface RawResultItem {
  file?: string;
  progress?: number;
  stage?: string;
  error?: string | null;
  dit_model?: string;
  metas?: { duration?: number | string | null };
}

export async function aceStepPoll(baseUrl: string, taskId: string): Promise<AceStepPollResult> {
  const data = await postJson<{ task_id: string; status: number; result?: string; progress_text?: string }[]>(baseUrl, '/query_result', {
    task_id_list: [taskId],
  });
  const entry = data?.find((d) => d.task_id === taskId) ?? data?.[0];
  if (!entry) return { state: 'running', progress: 0, stage: 'queued', error: null, results: [] };

  // `result` is itself a JSON-encoded string holding an array of per-file objects.
  let items: RawResultItem[] = [];
  try {
    const parsed = JSON.parse(entry.result ?? '[]');
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }
  const first = items[0];

  if (entry.status === 0) {
    return {
      state: 'running',
      progress: typeof first?.progress === 'number' ? first.progress : 0,
      stage: first?.stage ?? 'queued',
      error: null,
      results: [],
    };
  }
  if (entry.status === 2) {
    return {
      state: 'failed',
      progress: 0,
      stage: 'failed',
      error: first?.error || 'Generation failed (the ACE-Step server log has the details).',
      results: [],
    };
  }

  const results = items
    .filter((item) => item.file)
    .map((item) => {
      const duration = Number(item.metas?.duration);
      return {
        fileUrl: item.file!,
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
        model: item.dit_model ?? null,
      };
    });
  // The server reports success even when it generated audio but couldn't save it; its
  // last log line (progress_text) is the only place the reason shows up.
  const error = results.length === 0 ? entry.progress_text?.replace(/^[\d:]+ \| \w+ \| /, '') || null : null;
  return { state: 'succeeded', progress: 1, stage: 'succeeded', error, results };
}

export async function aceStepDownload(baseUrl: string, fileUrl: string): Promise<Buffer> {
  const url = /^https?:\/\//i.test(fileUrl) ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw friendlyUnreachableError(baseUrl, err);
  }
  if (!res.ok) {
    throw new Error(`Couldn't download the generated audio (${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}
