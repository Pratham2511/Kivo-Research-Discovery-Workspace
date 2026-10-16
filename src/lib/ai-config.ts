/** Public provider metadata only. Credentials are never part of the workspace schema. */
export const AI_PROVIDERS = {
  google: { name: "Google AI Studio (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash", keyUrl: "https://aistudio.google.com/api-keys" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyUrl: "https://platform.openai.com/api-keys" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyUrl: "https://console.groq.com/keys" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash", keyUrl: "https://openrouter.ai/settings/keys" },
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;
export interface AiSettings { provider: AiProvider; apiKey: string; model: string }
export interface LlmConfig { apiKey: string; baseUrl: string; model: string }

export function validAiSettings(value: unknown): value is AiSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as AiSettings;
  return Object.hasOwn(AI_PROVIDERS, v.provider) && typeof v.apiKey === "string"
    && /^[\x21-\x7E]{8,512}$/.test(v.apiKey) && typeof v.model === "string"
    && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(v.model);
}
