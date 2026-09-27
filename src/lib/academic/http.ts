/** Bounded, abortable transport. One connection per provider per app process. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
const queues = new Map<string, Promise<void>>();
const nextAt = new Map<string, number>();
export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      },
      Math.max(0, ms),
    );
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
async function waitForTurn(previous: Promise<void>, signal?: AbortSignal) {
  if (!signal) return previous;
  signal.throwIfAborted();
  let cancel!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    await Promise.race([previous, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
async function readBounded(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 6 * 1024 * 1024) {
      await reader.cancel();
      throw new ProviderError("Provider payload exceeds 6 MB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function providerFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const host = new URL(input).hostname;
  const interval =
    host === "export.arxiv.org"
      ? 3000
      : host.includes("semanticscholar")
        ? 1100
        : 400;
  const previous = queues.get(host) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => {}).then(() => gate);
  queues.set(host, queued);
  // An aborted waiter must not free an earlier request's provider slot.
  void queued.then(() => {
    if (queues.get(host) === queued) queues.delete(host);
  });
  const signal = init.signal || undefined;
  try {
    await waitForTurn(previous, signal);
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      await pause((nextAt.get(host) || 0) - Date.now(), signal);
      nextAt.set(host, Date.now() + interval);
      const response = await fetch(input, { ...init, cache: "no-store" });
      const bytes = await readBounded(response);
      if (response.ok || response.status === 404)
        return new Response(bytes as BodyInit, {
          status: response.status,
          headers: response.headers,
        });
      const raw = response.headers.get("retry-after");
      const wait = raw
        ? /^\d+$/.test(raw)
          ? Number(raw) * 1000
          : Date.parse(raw) - Date.now()
        : 500 + Math.random() * 300;
      if (Number.isFinite(wait) && raw)
        nextAt.set(host, Math.max(nextAt.get(host) || 0, Date.now() + wait));
      if (
        attempt === 0 &&
        (response.status === 429 || response.status >= 500)
      ) {
        if (wait > 8000)
          throw new ProviderError(
            "Provider asks to retry later",
            response.status,
          );
        await pause(Math.max(interval, wait || 0), signal);
        continue;
      }
      throw new ProviderError(
        `Provider HTTP ${response.status}`,
        response.status,
      );
    }
    throw new ProviderError("Provider unavailable");
  } finally {
    release();
  }
}
