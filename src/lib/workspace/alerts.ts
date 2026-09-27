import type { SearchResult } from "@/lib/academic/types";
import type { Workspace } from "./schema";
/** Mutates only this alert's persisted observations; failed checks never seed a baseline. */
export function applyAlertResult(
  state: Workspace,
  id: string,
  result: SearchResult,
  checkedAt: string,
) {
  const current = state.alerts.find((a) => a.id === id);
  if (!current) return;
  current.lastRunAt = checkedAt;
  current.error =
    result.error ||
    result.sources
      .filter((s) => !s.success)
      .map((s) => `${s.source}: ${s.status}`)
      .join("; ") ||
    undefined;
  if (result.error) return;
  const baseline = current.seen.length > 0;
  const seen = new Set(current.seen);
  for (const paper of result.papers) {
    if (
      baseline &&
      !seen.has(paper.id) &&
      !state.inbox.some((n) => n.id === `${current.id}:${paper.id}`)
    ) {
      state.inbox.unshift({
        id: `${current.id}:${paper.id}`,
        alertId: current.id,
        paper,
        discoveredAt: checkedAt,
        read: false,
      });
    }
    seen.add(paper.id);
  }
  seen.add("__baseline__");
  if (seen.size > 20000)
    throw new Error(
      "This alert reached its 20,000-record history limit. Export the workspace before starting a new alert.",
    );
  current.seen = [...seen];
  state.inbox = state.inbox.slice(0, 2000);
}
