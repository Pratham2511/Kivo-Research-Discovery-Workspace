import { emptyWorkspace, type Workspace } from "./schema";

/**
 * KIVO operates in a browser-first local mode.
 *
 * The researcher's working set (saved papers, projects, evidence, compare tray,
 * search history, alerts, inbox) lives authoritatively in the browser via
 * IndexedDB / localStorage (see storage-engine.ts and repository.ts).
 *
 * The server is intentionally a lightweight, database-free relay: it never
 * overwrites the local copy with stale data and accepts writes as acknowledged
 * no-ops. This keeps the application fully functional with zero infrastructure
 * while preserving the optional-sync contract the client expects.
 */

const SERVER_REVISION = 1;

export async function readWorkspace() {
  // Return an empty workspace; the client's local copy is authoritative and
  // the merge logic in use-workspace.ts preserves the local set when it has
  // equal or more records than the (empty) server snapshot.
  return {
    revision: SERVER_REVISION,
    state: emptyWorkspace(),
  };
}

export async function writeWorkspace(_state: Workspace, revision: number) {
  // Acknowledge the write without persisting server-side. The browser is the
  // source of truth; the revision is echoed back so the client stays in sync.
  void revision;
  return true;
}
