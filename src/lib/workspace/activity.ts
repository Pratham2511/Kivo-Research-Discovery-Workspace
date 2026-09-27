import type { Workspace } from "./schema";

/**
 * Desk-activity analytics — focus sessions & reading streaks
 * (FUTURE_FEATURES.md #8).
 *
 * Deliberately *derived*, never stored: every count below is reconstructible
 * from timestamps the workspace already keeps (evidence.createdAt,
 * events.createdAt, reviewLog.at). No schema change, no double bookkeeping,
 * and a restored backup immediately recovers its full streak history.
 */

export interface DayActivity {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  captured: number; // evidence records created
  graded: number; // flashcards graded
  screened: number; // screening decisions made
  total: number;
}

/** Structural subset of Workspace — callers pass what they have. */
export interface ActivitySource {
  evidence: Array<{ createdAt: string }>;
  events: Array<{ createdAt: string }>;
  reviewLog?: Array<{ at: string }>;
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Aggregate all workspace activity into a per-day map. */
export function deriveDailyActivity(state: ActivitySource): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();
  const touch = (iso: string, key: keyof Omit<DayActivity, "date" | "total">) => {
    if (!iso) return;
    const date = localDateKey(new Date(iso));
    const entry =
      days.get(date) ?? { date, captured: 0, graded: 0, screened: 0, total: 0 };
    entry[key]++;
    entry.total++;
    days.set(date, entry);
  };
  state.evidence.forEach((e) => touch(e.createdAt, "captured"));
  state.events.forEach((e) => touch(e.createdAt, "screened"));
  (state.reviewLog ?? []).forEach((r) => touch(r.at, "graded"));
  return days;
}

/** Convenience overload for full workspaces. */
export function deriveWorkspaceActivity(state: Workspace): Map<string, DayActivity> {
  return deriveDailyActivity(state);
}

/**
 * Consecutive-day streak of desk activity, ending today (or yesterday — a
 * streak shouldn't read as broken at 9 a.m. before any work is done today).
 */
export function computeActivityStreak(
  days: Map<string, DayActivity>,
  today = new Date(),
): number {
  let streak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // If today has no activity yet, start counting from yesterday.
  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    if (days.has(localDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      return streak;
    }
  }
}

export interface ActivityCell {
  date: string;
  total: number;
  isToday: boolean;
  isFuture: boolean;
  monthLabel?: string; // set on the first cell of a month, for column labels
}

/**
 * 12-week GitHub-style grid, oldest week first: `weeks[12][7]` (Mon→Sun rows).
 * Intensity levels are computed by the caller for rendering.
 */
export function buildActivityGrid(
  days: Map<string, DayActivity>,
  weeks = 12,
  today = new Date(),
): ActivityCell[][] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Walk back to this week's Monday.
  const dow = (end.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(end);
  monday.setDate(end.getDate() - dow);
  const start = new Date(monday);
  start.setDate(monday.getDate() - (weeks - 1) * 7);

  const grid: ActivityCell[][] = [];
  const todayKey = localDateKey(today);
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const week: ActivityCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(start);
      cellDate.setDate(start.getDate() + w * 7 + d);
      const key = localDateKey(cellDate);
      const isFuture = key > todayKey;
      const month = cellDate.getMonth();
      const monthLabel = month !== lastMonth && !isFuture ? shortMonth(cellDate) : undefined;
      if (month !== lastMonth) lastMonth = month;
      week.push({
        date: key,
        total: days.get(key)?.total ?? 0,
        isToday: key === todayKey,
        isFuture,
        monthLabel,
      });
    }
    grid.push(week);
  }
  return grid;
}

function shortMonth(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short" });
}

/** 0 = no activity … 4 = heaviest day in the window. */
export function intensityLevel(total: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || max <= 0) return 0;
  const ratio = total / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}
