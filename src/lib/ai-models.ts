import type { LlmConfig } from "./ai-config";
import { googleBaseUrl, isGoogleConfig, LlmError, providerFailure, providerHeaders } from "./llm";

/** A catalog is not a promise of free quota or permission to generate. */
export function textModelIds(data: unknown, google: boolean): string[] {
  if (!data || typeof data !== "object") return [];
  const body = data as { models?: unknown; data?: unknown };
  const rows = google ? body.models : body.data;
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.flatMap(row => {
    if (!row || typeof row !== "object") return [];
    const model = row as { name?: unknown; id?: unknown; supportedGenerationMethods?: unknown };
    const raw = google ? model.name : model.id;
    if (typeof raw !== "string") return [];
    const id = raw.replace(/^models\//, "");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(id)) return [];
    if (google && (!id.startsWith("gemini-") || !Array.isArray(model.supportedGenerationMethods) || !model.supportedGenerationMethods.includes("generateContent"))) return [];
    if (/(?:image|audio|tts|live|embedding|robotics|computer-use|omni|transcribe|translate|realtime|whisper|dall-e)/i.test(id)) return [];
    return [id];
  }))].sort().slice(0, 200);
}

export async function listProviderModels(config: LlmConfig): Promise<string[]> {
  const google = isGoogleConfig(config);
  try {
    const response = await fetch(google ? `${googleBaseUrl()}/models?pageSize=1000` : `${config.baseUrl}/models`, {
      headers: providerHeaders(config), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw providerFailure(response.status, body);
    const models = textModelIds(body, google);
    if (!models.length) throw new LlmError("The provider returned no supported text models. Check your key's permissions or enter a model ID manually.", 400);
    return models;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError("Could not load provider models. Check your connection and try again.");
  }
}
