/**
 * KIVO is a single-user local research workspace.
 *
 * There is no authentication layer and no server-side user table. This module
 * preserves the contract (a stable local user identifier) that other parts of
 * the codebase historically relied on, without touching any database.
 */

const LOCAL_USER_ID = "local-researcher";
const LOCAL_USER_EMAIL = "researcher@kivo.local";

/**
 * No-op. The browser is the home of the working set; no server-side user row
 * is required for KIVO's local-first operation.
 */
export async function ensureLocalUser() {
  return {
    id: LOCAL_USER_ID,
    email: LOCAL_USER_EMAIL,
    name: "Researcher",
  };
}

export function getLocalUserId(): string {
  return LOCAL_USER_ID;
}
