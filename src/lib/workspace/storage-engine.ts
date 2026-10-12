import { emptyWorkspace, type Workspace } from "./schema";
import { normalizeWorkspace, decodeCacheSnapshot } from "./repository";
import { nextSaveTime, observeSaveTime } from "./storage-snapshot";

const STORAGE_KEY = "kivo_workspace_cache_v1";

/** Best-effort cache and in-memory copy. IndexedDB stores larger workspaces. */
export class LocalStorageEngine {
  private inMemoryWorkspace: Workspace;

  constructor() {
    this.inMemoryWorkspace = emptyWorkspace();
    if (typeof window !== "undefined") {
      this.inMemoryWorkspace = this.loadSync();
    }
  }

  /**
   * Synchronous load from localStorage for immediate zero-latency initial render
   */
  public loadSync(): Workspace {
    if (typeof window === "undefined") return emptyWorkspace();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const snapshot = decodeCacheSnapshot(parsed);
        if (snapshot) observeSaveTime(snapshot.savedAt);
        this.inMemoryWorkspace = snapshot?.state ?? normalizeWorkspace(parsed);
        return this.inMemoryWorkspace;
      }
    } catch (e) {
      console.warn("Could not read from localStorage, using memory", e);
    }
    return this.inMemoryWorkspace;
  }

  /**
   * Synchronous save to localStorage + memory
   */
  public saveSync(workspace: Workspace, savedAt = nextSaveTime()): boolean {
    this.inMemoryWorkspace = workspace;
    if (typeof window === "undefined") return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: workspace, savedAt }));
      return true;
    } catch (e) {
      // The caller checks this result; IndexedDB may already have saved it.
      return false;
    }
  }

  public getWorkspace(): Workspace {
    return this.inMemoryWorkspace;
  }
}

export const localCache = new LocalStorageEngine();
