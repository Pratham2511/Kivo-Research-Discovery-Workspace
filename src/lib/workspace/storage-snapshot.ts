import type { Workspace } from "./schema";

export interface WorkspaceSnapshot { state: Workspace; savedAt: string }
let lastSaveTime = 0;

export function observeSaveTime(savedAt: string) {
  const time = Date.parse(savedAt);
  if (Number.isFinite(time)) lastSaveTime = Math.max(lastSaveTime, time);
}

/** Both stores receive the same monotonically increasing save timestamp. */
export function nextSaveTime(): string {
  lastSaveTime = Math.max(Date.now(), lastSaveTime + 1);
  return new Date(lastSaveTime).toISOString();
}

export function newestSnapshot(indexed: WorkspaceSnapshot | null, cached: WorkspaceSnapshot | null) {
  if (!indexed) return cached;
  if (!cached) return indexed;
  return Date.parse(cached.savedAt) > Date.parse(indexed.savedAt) ? cached : indexed;
}
