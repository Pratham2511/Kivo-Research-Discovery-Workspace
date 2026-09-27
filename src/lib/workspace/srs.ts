import type { Evidence, ReviewSchedule, Workspace } from "./schema";

/**
 * SM-2 spaced repetition engine (SuperMemo 2, the algorithm behind Anki's
 * classic scheduler) applied to research evidence.
 *
 * The mapping is deliberate and honest about its sources:
 * - A "card" is one captured evidence item — no separate card store exists.
 * - The FRONT of the card is the evidence's field + paper (the prompt).
 * - The BACK is the statement (for author passages, the verbatim quote).
 * - Grades map to four buttons: AGAIN (0) · HARD (3) · GOOD (4) · EASY (5).
 *
 * Pure functions only — everything here is derivable and testable.
 */

export type Grade = 0 | 3 | 4 | 5;

export const GRADE_LABELS: Record<Grade, string> = {
  0: "Again",
  3: "Hard",
  4: "Good",
  5: "Easy",
};

export const FRESH_SCHEDULE: Omit<ReviewSchedule, "evidenceId"> = {
  ease: 2.5,
  intervalDays: 0,
  dueAt: new Date(0).toISOString(), // never-studied cards are always due
  reps: 0,
  lapses: 0,
  lastReviewedAt: null,
  suspended: false,
};

/** Day-level fuzz (±5%) so batch-graded cards don't pile onto one day. */
function fuzz(days: number): number {
  if (days <= 1) return days;
  const jitter = 1 + (Math.random() - 0.5) * 0.1;
  return Math.max(1, Math.round(days * jitter));
}

/**
 * Apply one SM-2 grading to a schedule. Returns a NEW schedule object.
 *
 * - q < 3 (Again): the interval collapses to 1 day, reps reset, lapse counts.
 * - q >= 3: ease adjusts by the canonical SM-2 delta, interval grows
 *   geometrically (1d → 6d → round(prev × ease)).
 */
export function applyGrade(
  schedule: ReviewSchedule,
  grade: Grade,
  now: Date = new Date(),
): ReviewSchedule {
  if (grade < 3) {
    return {
      ...schedule,
      ease: Math.max(1.3, schedule.ease - 0.2),
      intervalDays: 1,
      dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      reps: 0,
      lapses: schedule.lapses + 1,
      lastReviewedAt: now.toISOString(),
    };
  }

  const q = grade as 3 | 4 | 5;
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const ease = Math.min(2.8, Math.max(1.3, schedule.ease + delta));
  const reps = schedule.reps + 1;
  const intervalDays =
    reps === 1 ? 1 : reps === 2 ? 6 : fuzz(schedule.intervalDays * ease);

  return {
    ...schedule,
    ease,
    intervalDays,
    dueAt: new Date(
      now.getTime() + intervalDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    reps,
    lastReviewedAt: now.toISOString(),
  };
}

/** The interval a grade would produce, for showing previews on buttons. */
export function previewInterval(
  schedule: ReviewSchedule,
  grade: Grade,
): number {
  if (grade < 3) return 1;
  const q = grade as 3 | 4 | 5;
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const ease = Math.min(2.8, Math.max(1.3, schedule.ease + delta));
  const reps = schedule.reps + 1;
  return reps === 1 ? 1 : reps === 2 ? 6 : Math.round(schedule.intervalDays * ease);
}

export function formatInterval(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/* ------------------------------------------------------------------ cards */

/** A flashcard is a view over one evidence item + its schedule (if any). */
export interface Flashcard {
  evidence: Evidence;
  schedule: ReviewSchedule;
  /** true when no review exists yet — the card is new, not lapsed. */
  isNew: boolean;
  due: boolean;
}

export function buildFlashcards(
  evidence: Workspace["evidence"],
  reviews: Workspace["reviews"],
  now: Date = new Date(),
): Flashcard[] {
  const byEvidence = new Map(reviews.map((r) => [r.evidenceId, r]));
  const nowMs = now.getTime();
  return evidence.map((e) => {
    const schedule = byEvidence.get(e.id) ?? {
      ...FRESH_SCHEDULE,
      evidenceId: e.id,
    };
    return {
      evidence: e,
      schedule,
      isNew: schedule.lastReviewedAt === null,
      due: !schedule.suspended && Date.parse(schedule.dueAt) <= nowMs,
    };
  });
}

/** Cards due now, shuffled lightly so papers interleave (context variety). */
export function dueQueue(cards: Flashcard[]): Flashcard[] {
  return cards
    .filter((c) => c.due)
    .sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1; // new cards first
      return Date.parse(a.schedule.dueAt) - Date.parse(b.schedule.dueAt);
    })
    .slice(0, 60); // a sane daily session cap
}

/* ------------------------------------------------------------------ stats */

export interface ReviewStats {
  totalCards: number;
  dueNow: number;
  newCards: number;
  suspended: number;
  /** consecutive days (ending today or yesterday) with ≥1 graded recall */
  streakDays: number;
  /** graded recalls in the last 30 days that were not "Again" */
  retention30: number | null;
  reviewsToday: number;
}

export function computeReviewStats(
  cards: Flashcard[],
  reviewLog: Workspace["reviewLog"],
  now: Date = new Date(),
): ReviewStats {
  const due = cards.filter((c) => c.due);
  const dayKey = (iso: string) => iso.slice(0, 10);
  const todayKey = dayKey(now.toISOString());

  // Streak: walk back day by day while the log shows activity.
  const activeDays = new Set(reviewLog.map((e) => dayKey(e.at)));
  let streakDays = 0;
  const cursor = new Date(now);
  if (!activeDays.has(dayKey(cursor.toISOString()))) {
    // A streak survives until the end of "yesterday".
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activeDays.has(dayKey(cursor.toISOString()))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recent = reviewLog.filter((e) => Date.parse(e.at) >= cutoff);
  const retained = recent.filter((e) => e.grade >= 3).length;

  return {
    totalCards: cards.length,
    dueNow: due.length,
    newCards: cards.filter((c) => c.isNew).length,
    suspended: cards.filter((c) => c.schedule.suspended).length,
    streakDays,
    retention30: recent.length >= 5 ? retained / recent.length : null,
    reviewsToday: reviewLog.filter((e) => dayKey(e.at) === todayKey).length,
  };
}

/** Front-of-card prompt: what the student should recall from. */
export function cardFront(evidence: Evidence, paperTitle: string): string {
  const short = paperTitle.length > 90 ? paperTitle.slice(0, 87) + "…" : paperTitle;
  switch (evidence.field) {
    case "Findings":
      return `What did “${short}” find?`;
    case "Method":
      return `How did “${short}” run the study?`;
    case "Dataset / sample":
      return `What data did “${short}” use?`;
    case "Evaluation":
      return `How was “${short}” evaluated?`;
    case "Metrics":
      return `Which metrics did “${short}” report?`;
    case "Limitations":
      return `What are the limits of “${short}”?`;
    case "Code / data":
      return `What code or data did “${short}” release?`;
    case "Question":
      return `What question does “${short}” ask?`;
    default:
      return `What did you note on “${short}”?`;
  }
}

/** Back-of-card answer: the statement (verbatim for author passages). */
export function cardBack(evidence: Evidence): string {
  return evidence.statement;
}
