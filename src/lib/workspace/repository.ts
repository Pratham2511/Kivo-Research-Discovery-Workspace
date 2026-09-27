import { emptyWorkspace, workspaceSchema, type Workspace } from "./schema";

/**
 * The browser is the primary home for a researcher's working set. The server
 * is deliberately an optional sync target, so a temporary database outage does
 * not turn reading, saving, comparison, or search records into unavailable
 * features.
 */
export interface WorkspaceRepository {
  load(): Promise<Workspace | null>;
  save(state: Workspace): Promise<void>;
}

const DATABASE_NAME = "kivo-workspace";
const DATABASE_VERSION = 1;
const STORE_NAME = "research";
const RECORD_KEY = "primary-workspace";
const LEGACY_LOCAL_KEYS = [
  "scholar-nexus:workspace:v1",
  "scholarnexus-workspace",
];

type StoredWorkspace = {
  key: string;
  schemaVersion: number;
  savedAt: string;
  state: unknown;
};

/** The only browser persistence adapter. It uses IndexedDB, not scattered keys. */
export class BrowserWorkspaceRepository implements WorkspaceRepository {
  private database: Promise<IDBDatabase> | null = null;

  async load(): Promise<Workspace | null> {
    const database = await this.open();
    const record = await request<StoredWorkspace | undefined>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY),
    );
    if (record) return decodeWorkspace(record.state);

    // A one-time migration path for the short-lived pre-repository browser key.
    for (const key of LEGACY_LOCAL_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const migrated = decodeWorkspace(JSON.parse(raw));
        if (migrated) {
          await this.save(migrated);
          window.localStorage.removeItem(key);
          return migrated;
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }
    return null;
  }

  async save(state: Workspace): Promise<void> {
    const normalized = normalizeWorkspace(state);
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      key: RECORD_KEY,
      schemaVersion: DATABASE_VERSION,
      savedAt: new Date().toISOString(),
      state: normalized,
    } satisfies StoredWorkspace);
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    if (typeof window === "undefined" || !window.indexedDB)
      return Promise.reject(new Error("Browser storage is unavailable."));
    this.database = new Promise((resolve, reject) => {
      const openRequest = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      openRequest.onupgradeneeded = () => {
        if (!openRequest.result.objectStoreNames.contains(STORE_NAME))
          openRequest.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error || new Error("Could not open browser storage."));
      openRequest.onblocked = () => reject(new Error("Browser storage is blocked by another KIVO tab."));
    });
    return this.database;
  }
}

export function normalizeWorkspace(candidate: Workspace): Workspace {
  const state = structuredClone(candidate) as Workspace & {
    version?: number;
    reviews?: Workspace["reviews"];
    reviewLog?: Workspace["reviewLog"];
    claims?: Workspace["claims"];
  };
  // v1 → v2: seed the spaced-repetition stores the first time an old
  // workspace (or a bare mutation draft) passes through.
  if (!Array.isArray(state.reviews)) state.reviews = [];
  if (!Array.isArray(state.reviewLog)) state.reviewLog = [];
  // v2 → v3: the argument builder's claims arrive empty and upgrade
  // transparently; member.repro stays optional so nothing else moves.
  if (!Array.isArray(state.claims)) state.claims = [];
  state.version = 3;
  const paperIds = new Set<string>();
  state.papers = state.papers.filter((paper) => {
    const identity = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.id;
    if (paperIds.has(identity)) return false;
    paperIds.add(identity);
    return true;
  });
  const savedIds = new Set(state.papers.map((paper) => paper.id));
  state.compare = [...new Set(state.compare)].filter((id) => savedIds.has(id)).slice(0, 8);
  state.searches = uniqueNewest(state.searches, 100);
  state.documents = uniqueNewest(state.documents, 100);
  state.evidence = uniqueNewest(state.evidence, 10_000);
  state.inbox = uniqueNewest(state.inbox, 2_000);
  state.events = uniqueNewest(state.events, 20_000);
  state.alerts = uniqueNewest(state.alerts, 100);
  state.projects = uniqueNewest(state.projects, 100);
  // Flashcards live exactly as long as their evidence: drop schedules for
  // evidence that no longer exists, dedupe by evidenceId, cap at schema max.
  const evidenceIds = new Set(state.evidence.map((e) => e.id));
  const seenReviews = new Set<string>();
  state.reviews = state.reviews
    .filter((r) => evidenceIds.has(r.evidenceId) && !seenReviews.has(r.evidenceId) && seenReviews.add(r.evidenceId))
    .slice(0, 10_000);
  state.reviewLog = state.reviewLog.slice(-5_000);
  // Claims: drop blanks, dedupe by id, cap, and keep only attachments that
  // still point at live evidence (the evidence desk is the source of truth —
  // a deleted receipt can no longer back anything).
  state.claims = state.claims
    .filter((c) => c.text && c.text.trim().length > 0)
    .map((c) => ({
      ...c,
      evidence: c.evidence.filter((link) => evidenceIds.has(link.evidenceId)),
    }));
  state.claims = uniqueNewest(state.claims, 500);
  state.version = 3;
  return workspaceSchema.parse(state);
}

export function decodeWorkspace(value: unknown): Workspace | null {
  const parsed = workspaceSchema.safeParse(value);
  return parsed.success ? normalizeWorkspace(parsed.data) : null;
}

/**
 * Keeps the local research record authoritative while accepting additions made
 * by the alert worker on the remote copy. It prevents a background sync from
 * deleting work created in an offline tab.
 */
export function mergeWorkspace(local: Workspace, remote: Workspace): Workspace {
  const merge = <T extends { id: string }>(a: T[], b: T[], cap: number) =>
    uniqueNewest([...a, ...b], cap);
  const alerts = merge(local.alerts, remote.alerts, 100).map((alert) => {
    const own = local.alerts.find((item) => item.id === alert.id);
    const incoming = remote.alerts.find((item) => item.id === alert.id);
    if (!own || !incoming) return alert;
    const incomingIsNewer = Date.parse(incoming.lastRunAt || "") > Date.parse(own.lastRunAt || "");
    return incomingIsNewer ? incoming : own;
  });
  return normalizeWorkspace({
    ...local,
    papers: merge(local.papers, remote.papers, 2_000),
    projects: merge(local.projects, remote.projects, 100),
    evidence: merge(local.evidence, remote.evidence, 10_000),
    documents: merge(local.documents, remote.documents, 100),
    searches: merge(local.searches, remote.searches, 100),
    inbox: merge(local.inbox, remote.inbox, 2_000),
    events: merge(local.events, remote.events, 20_000),
    alerts,
    compare: [...new Set([...local.compare, ...remote.compare])].slice(0, 8),
    // Schedules merge by evidenceId (newest lastReviewedAt wins via id map).
    reviews: merge(
      (local.reviews ?? []).map((r) => ({ ...r, id: r.evidenceId })),
      (remote.reviews ?? []).map((r) => ({ ...r, id: r.evidenceId })),
      10_000,
    ).map(({ id: _id, ...r }) => r),
    reviewLog: merge(
      (local.reviewLog ?? []).map((e, i) => ({ ...e, id: `${e.evidenceId}:${e.at}:${i}` })),
      (remote.reviewLog ?? []).map((e, i) => ({ ...e, id: `${e.evidenceId}:${e.at}:${i}` })),
      5_000,
    ).map(({ id: _id, evidenceId, grade, at }) => ({ evidenceId, grade, at })),
    claims: merge(local.claims ?? [], remote.claims ?? [], 500),
  });
}

function uniqueNewest<T extends { id: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  return [...items]
    .reverse()
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .reverse()
    .slice(0, limit);
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error || new Error("Browser storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save research locally."));
    transaction.onabort = () => reject(transaction.error || new Error("Local save was interrupted."));
  });
}

export const emptyLocalWorkspace = emptyWorkspace;
