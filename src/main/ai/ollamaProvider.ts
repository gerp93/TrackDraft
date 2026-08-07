function friendlyUnreachableError(baseUrl: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`Couldn't reach Ollama at ${baseUrl} -- is it running? (${detail})`);
}

export async function ollamaChat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  if (!model.trim()) {
    throw new Error('No Ollama model selected. Pick one in Settings.');
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: false,
      }),
    });
  } catch (err) {
    throw friendlyUnreachableError(baseUrl, err);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama request failed (${res.status}): ${body || res.statusText}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? '';
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/tags`);
  } catch (err) {
    throw friendlyUnreachableError(baseUrl, err);
  }

  if (!res.ok) {
    throw new Error(`Couldn't list Ollama models (${res.status}).`);
  }

  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}
