"use client";

import { validAiSettings, type AiSettings } from "./ai-config";

const STORAGE_KEY = "kivo.ai.session.v1";

export function readAiSettings(): AiSettings | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    return validAiSettings(value) ? value : null;
  } catch { return null; }
}

export function saveAiSettings(settings: AiSettings): void {
  if (!validAiSettings(settings)) throw new Error("Choose a provider and enter a valid key and model ID.");
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { throw new Error("Session storage is blocked. Allow site storage to save this key in this tab."); }
}

export function clearAiSettings(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); }
  catch { throw new Error("Could not clear session storage. Close this tab to end the session."); }
}

/** Only attach credentials to the AI endpoints, never searches, exports, or backups. */
export function aiHeaders(settings = readAiSettings()): Record<string, string> {
  return settings ? {
    "Content-Type": "application/json", "X-Kivo-AI-Provider": settings.provider,
    "X-Kivo-AI-Key": settings.apiKey, "X-Kivo-AI-Model": settings.model,
  } : { "Content-Type": "application/json" };
}
