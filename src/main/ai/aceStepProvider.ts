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

/** A local audio file sent along with a task. Uploaded with the request (multipart)
 * rather than passed as a path: the server refuses absolute paths outside its own temp
 * folder (`validate_audio_path` in acestep/api/http/release_task_audio_paths.py). */
export interface AceStepAudioUpload {
  fileName: string;
  data: Buffer;
}

export interface AceStepTaskInput {
  prompt: string;
  lyrics: string;
  durationSeconds?: number | null;
  /** Exact seed to generate with; null/undefined lets the server pick a random one. */
  seed?: string | null;
  /** 30-300; null lets the model decide. */
  bpm?: number | null;
  /** e.g. "C major", "F# minor" (the server's VALID_KEYSCALES format); null = model decides. */
  keyScale?: string | null;
  /** Beats per bar: "2", "3", "4" or "6" (6 = 6/8); null = model decides. */
  timeSignature?: string | null;
  /** Sound-alike reference: steers timbre and production toward this recording. */
  referenceAudio?: AceStepAudioUpload | null;
  /** Restyle this audio (the `cover` task) instead of generating from scratch. */
  cover?: { source: AceStepAudioUpload; strength: number } | null;
}

export interface AceStepAudioResult {
  /** Server-relative URL of the audio file, e.g. `/v1/audio?path=...`. */
  fileUrl: string;
  durationSeconds: number | null;
  model: string | null;
  /** The seed the server used for this file, as text (seeds can exceed 2^53). */
  seed: string | null;
  /** What the model actually used, so a caller can see whether requested values held. */
  bpm: number | null;
  keyScale: string | null;
  timeSignature: string | null;
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
  return new Error(`Couldn't reach ACE-Step at ${baseUrl} -- is its API server running? Start it from the song's audio panel or Settings. (${detail})`);
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
  const body: Record<string, string | number | boolean> = {
    prompt: input.prompt,
    lyrics: input.lyrics,
    // Let the server's language model plan the arrangement (and fill in tempo/key/length
    // the user didn't specify). Ignored by servers started without the LM, and skipped by
    // the server for the cover task, which works from the source audio instead.
    // Off when a seed is being reused: the planning step is unseeded on the server (see
    // below), so leaving it on would make the seed meaningless -- every "same seed" take
    // would be unrelated to the last. With it off, the same seed and inputs give the
    // same audio, and a small lyric change gives a closely related take.
    thinking: !input.seed,
    // The server's default is 2 variations per request; one take per click keeps the
    // wait short and the takes list in the user's hands.
    batch_size: 1,
    // FLAC, not the server's default MP3: its MP3 export needs ffmpeg on the PATH and
    // otherwise "succeeds" with no file at all. FLAC is written natively.
    audio_format: 'flac',
  };
  if (input.durationSeconds) body.audio_duration = input.durationSeconds;
  if (input.seed) {
    // Sent as text: the server accepts a string seed, and a JSON number would lose
    // precision on seeds above 2^53. The seed fixes the diffusion (DiT) stage only: the
    // server's default vllm LM backend ignores seeds when planning (thinking), so with
    // thinking on the same seed does NOT reproduce a take -- hence thinking is off for
    // seeded runs (above). Consequence: reusing the seed of a take that was made WITH
    // planning does not recreate that take; it starts a reproducible line from that seed.
    // Covers skip the LM and come out near-identical; text2music with thinking off is
    // bit-identical.
    body.use_random_seed = false;
    body.seed = input.seed;
  }
  // Explicit values always win over the LM's own planning; blank ones it fills in.
  if (input.bpm) body.bpm = input.bpm;
  if (input.keyScale) body.key_scale = input.keyScale;
  if (input.timeSignature) body.time_signature = input.timeSignature;
  if (input.cover) {
    body.task_type = 'cover';
    body.audio_cover_strength = input.cover.strength;
  }

  const uploads: [field: string, file: AceStepAudioUpload][] = [];
  if (input.referenceAudio) uploads.push(['reference_audio', input.referenceAudio]);
  if (input.cover) uploads.push(['src_audio', input.cover.source]);

  let data: { task_id?: string };
  if (uploads.length === 0) {
    data = await postJson<{ task_id?: string }>(baseUrl, '/release_task', body);
  } else {
    // Multipart: every field goes as text (the server parses "true", numbers etc.), and
    // fetch sets the boundary header itself.
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) form.append(key, String(value));
    for (const [field, file] of uploads) {
      form.append(field, new Blob([new Uint8Array(file.data)]), file.fileName);
    }
    data = await request<{ task_id?: string }>(baseUrl, '/release_task', { method: 'POST', body: form });
  }
  if (!data?.task_id) throw new Error('ACE-Step did not return a task id.');
  return data.task_id;
}

interface RawResultItem {
  file?: string;
  progress?: number;
  stage?: string;
  error?: string | null;
  dit_model?: string;
  /** Comma-separated, one per file in the batch (same string on every item). */
  seed_value?: string;
  metas?: {
    duration?: number | string | null;
    bpm?: number | string | null;
    keyscale?: string | null;
    timesignature?: string | number | null;
  };
}

/** The server writes "N/A" or "" for metas it doesn't know. */
function metaText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text.toUpperCase() !== 'N/A' ? text : null;
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
    .map((item, index) => {
      const duration = Number(item.metas?.duration);
      const bpm = Number(item.metas?.bpm);
      const seeds = (item.seed_value ?? '').split(',').map((s) => s.trim());
      return {
        fileUrl: item.file!,
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
        model: item.dit_model ?? null,
        seed: seeds[index] || seeds[0] || null,
        bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
        keyScale: metaText(item.metas?.keyscale),
        timeSignature: metaText(item.metas?.timesignature),
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
