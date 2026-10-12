import type { Workspace } from "./schema";
import type { WorkspaceRepository } from "./repository";
import { nextSaveTime } from "./storage-snapshot";

interface WorkspaceCache {
  saveSync(state: Workspace, savedAt?: string): boolean;
}

/** A relay acknowledgement is never evidence of durable storage. */
export async function persistWorkspace(
  state: Workspace,
  repository: WorkspaceRepository,
  cache: WorkspaceCache,
): Promise<{ durable: boolean; error: string }> {
  const savedAt = nextSaveTime();
  let indexed = false;
  try {
    await repository.save(state, savedAt);
    indexed = true;
  } catch {
    // Continue to the independent fallback; never discard the user's draft.
  }
  let cached = false;
  try { cached = cache.saveSync(state, savedAt); } catch { /* fallback unavailable */ }
  const durable = indexed || cached;
  return {
    durable,
    error: durable ? "" : "Browser storage is full or unavailable. Your latest changes are only in this tab. Download a backup before closing it.",
  };
}
