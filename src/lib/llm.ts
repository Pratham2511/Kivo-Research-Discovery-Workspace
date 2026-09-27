/**
 * Provider-agnostic LLM client for Kivo's two AI surfaces
 * (/api/ask — grounded Q&A, /api/gloss — verified plain-language rewrite).
 *
 * Kivo ships with NO bundled AI provider: the desk runs 100% usable with
 * no model at all — both AI surfaces abstain honestly when nothing is
 * configured. To enable them, point the app at ANY OpenAI-compatible
 * chat-completions endpoint (OpenAI, Groq, Together, Mistral, DeepSeek,
 * OpenRouter, a local Ollama or llama.cpp server, …) with three optional
 * environment variables:
 *
 *   LLM_API_KEY   the provider key (any non-empty string for local servers)
 *   LLM_BASE_URL  e.g. https://api.openai.com/v1      (default)
 *   LLM_MODEL     e.g. gpt-4o-mini                    (default)
 *
 * OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL are accepted as aliases.
 *
 * Everything else in the app (search, screening, evidence, flashcards,
 * graphs, seminars, exports) is pure local computation and never touches
 * this module.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmStatus {
  /** true when a provider key is configured and the AI surfaces will engage */
  enabled: boolean;
  /** human-readable provider label, e.g. "gpt-4o-mini · api.openai.com" */
  label: string | null;
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** Resolve the current provider configuration (or null when disabled). */
function resolveConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = envValue("LLM_API_KEY", "OPENAI_API_KEY");
  if (!apiKey) return null;
  const baseUrl = (
    envValue("LLM_BASE_URL", "OPENAI_BASE_URL") ?? "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = envValue("LLM_MODEL", "OPENAI_MODEL") ?? "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

/**
 * Provider status for /api/health and UI transparency.
 * The label deliberately shows only the model and endpoint host — never
 * the key.
 */
export function llmStatus(): LlmStatus {
  const config = resolveConfig();
  if (!config) return { enabled: false, label: null };
  let host = config.baseUrl;
  try {
    host = new URL(config.baseUrl).host;
  } catch {
    /* keep the raw string if it is not a parseable URL */
  }
  return { enabled: true, label: `${config.model} · ${host}` };
}

/**
 * One chat completion against the configured OpenAI-compatible endpoint.
 *
 * Returns the message text, or null when: no provider is configured, the
 * request fails, times out, or returns an empty/oddly-shaped body. Callers
 * treat null as "model unavailable" and abstain — a research desk would
 * rather show nothing than something unverifiable.
 */
export async function llmComplete(
  messages: LlmMessage[],
  opts: { timeoutMs?: number; temperature?: number } = {},
): Promise<string | null> {
  const config = resolveConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: opts.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim().length > 0
      ? text.trim()
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
