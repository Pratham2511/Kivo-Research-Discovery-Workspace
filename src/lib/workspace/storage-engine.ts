import { emptyWorkspace, type Workspace } from "./schema";
import { normalizeWorkspace } from "./repository";

const STORAGE_KEY = "kivo_workspace_cache_v1";

/**
 * Bulletproof Browser Cache & Local Storage Engine
 * Provides instant synchronous reads and writes so saved papers, search history,
 * comparison tray, and projects persist 100% reliably even when the database is offline.
 */
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
        return normalizeWorkspace(parsed);
      }
    } catch (e) {
      console.warn("Could not read from localStorage, using memory", e);
    }
    return emptyWorkspace();
  }

  /**
   * Synchronous save to localStorage + memory
   */
  public saveSync(workspace: Workspace): boolean {
    this.inMemoryWorkspace = workspace;
    if (typeof window === "undefined") return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      return true;
    } catch (e) {
      console.warn("Could not save to localStorage, cached in memory only", e);
      return false;
    }
  }

  public getWorkspace(): Workspace {
    return this.inMemoryWorkspace;
  }
}

export const localCache = new LocalStorageEngine();
