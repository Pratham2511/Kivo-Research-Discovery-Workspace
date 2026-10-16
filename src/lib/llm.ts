/**
 * Provider-agnostic LLM client for Kivo's two AI surfaces
 * (/api/ask — grounded Q&A, /api/gloss — verified plain-language rewrite).
 *
 * Kivo ships with NO bundled AI provider: the desk runs 100% usable with
 * no model at all — both AI surfaces abstain honestly when nothing is
 * configured. To enable them, point the app at ANY OpenAI-compatible
 * chat-completions endpoint (OpenAI, Groq, Together, Mistral, DeepSeek,
 * OpenRouter, a local Ollama or llama.cpp server, …) with three optional
 * environment variables as an operator-managed fallback. Browser Settings
 * provide request-scoped credentials on hosted deployments:
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

import { AI_PROVIDERS, validAiSettings, type LlmConfig } from "./ai-config";

export class LlmError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

export function providerFailure(status: number): LlmError {
  if (status === 401 || status === 403) return new LlmError("The provider rejected this key or its permissions. Check your API key in Settings.", 401);
  if (status === 429) return new LlmError("Your AI provider's quota or rate limit was reached. Check your provider account or try later.", 429);
  if (status === 404) return new LlmError("The provider could not find this model. Check the model ID in Settings.", 400);
  return new LlmError("The AI provider could not complete the request. Check your model and provider account, then try again.");
}

/** Request-scoped only: never write a visitor's credentials into process.env. */
export function requestLlmConfig(headers: Headers): LlmConfig | null {
  const provider = headers.get("x-kivo-ai-provider");
  const apiKey = headers.get("x-kivo-ai-key");
  const model = headers.get("x-kivo-ai-model");
  if (provider === null && apiKey === null && model === null) return resolveConfig();
  const settings = { provider, apiKey, model };
  if (!validAiSettings(settings)) throw new LlmError("Invalid AI settings. Choose a provider and check the key and model in Settings.", 400);
  return { apiKey: settings.apiKey, model: settings.model, baseUrl: AI_PROVIDERS[settings.provider].baseUrl };
}

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
export function llmStatus(config: LlmConfig | null = resolveConfig()): LlmStatus {
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
 * Returns message text, or null for a disabled provider or empty body.
 * Connection and provider failures throw a sanitized LlmError; route
 * handlers return the safe message without upstream bodies or credentials.
 */
export async function llmComplete(
  messages: LlmMessage[],
  opts: { timeoutMs?: number; temperature?: number; config?: LlmConfig | null; maxTokens?: number } = {},
): Promise<string | null> {
  const config = opts.config === undefined ? resolveConfig() : opts.config;
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw providerFailure(res.status);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim().length > 0
      ? text.trim()
      : null;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError(controller.signal.aborted ? "The AI provider timed out. Try again or select a faster model in Settings." : "Could not connect to the AI provider. Try again shortly.", controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}
