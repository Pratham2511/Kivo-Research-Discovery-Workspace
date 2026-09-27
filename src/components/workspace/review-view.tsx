"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  Brain,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Flame,
  Gauge,
  RotateCcw,
  PauseCircle,
  PlayCircle,
  BookOpen,
  ArrowRight,
  CalendarDays,
  Target,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { Evidence, Paper } from "./paper-card";
import type { ReviewLogEntry, ReviewSchedule } from "@/lib/workspace/schema";
import {
  buildFlashcards,
  cardBack,
  cardFront,
  computeReviewStats,
  dueQueue,
  formatInterval,
  GRADE_LABELS,
  previewInterval,
  type Grade,
} from "@/lib/workspace/srs";
import {
  buildActivityGrid,
  computeActivityStreak,
  deriveDailyActivity,
  intensityLevel,
  localDateKey,
} from "@/lib/workspace/activity";

interface ReviewViewProps {
  papers: Paper[];
  evidence: Evidence[];
  reviews: ReviewSchedule[];
  reviewLog: ReviewLogEntry[];
  events: Array<{ id: string; createdAt: string }>;
  onGrade: (evidenceId: string, grade: Grade) => void;
  onToggleSuspend: (evidenceId: string) => void;
  onOpenPaper: (paper: Paper) => void;
  onNavigateToReader: () => void;
}

const GRADE_STYLES: Record<Grade, string> = {
  0: "btn-accent-red",
  3: "btn-accent-orange",
  4: "btn-accent-green",
  5: "btn-accent-cyan",
};

/* Daily capture goal — persisted in localStorage, read through
 * useSyncExternalStore so hydration stays exact (server snapshot = 3). */
const GOAL_EVENT = "kivo:daily-goal-change";
function subscribeGoal(callback: () => void) {
  window.addEventListener(GOAL_EVENT, callback);
  return () => window.removeEventListener(GOAL_EVENT, callback);
}
function readGoalClient(): number {
  const stored = Number(localStorage.getItem("kivo_daily_goal"));
  if (Number.isFinite(stored) && stored >= 1 && stored <= 10) return stored;
  return 3;
}
function readGoalServer(): number {
  return 3;
}

export function ReviewView({
  papers,
  evidence,
  reviews,
  reviewLog,
  events,
  onGrade,
  onToggleSuspend,
  onOpenPaper,
  onNavigateToReader,
}: ReviewViewProps) {
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [browseTab, setBrowseTab] = useState<"queue" | "all">("queue");
  const dailyGoal = useSyncExternalStore(subscribeGoal, readGoalClient, readGoalServer);
  const changeGoal = useCallback((goal: number) => {
    localStorage.setItem("kivo_daily_goal", String(goal));
    window.dispatchEvent(new Event(GOAL_EVENT));
  }, []);

  const paperById = useMemo(
    () => new Map(papers.map((p) => [p.id, p])),
    [papers],
  );

  const cards = useMemo(
    () => buildFlashcards(evidence, reviews),
    [evidence, reviews],
  );
  const stats = useMemo(
    () => computeReviewStats(cards, reviewLog),
    [cards, reviewLog],
  );

  // ---- Desk activity (streak calendar + daily goal) ----------------------
  const activityDays = useMemo(
    () => deriveDailyActivity({ evidence, events, reviewLog }),
    [evidence, events, reviewLog],
  );
  const activityGrid = useMemo(
    () => buildActivityGrid(activityDays, 12),
    [activityDays],
  );
  const deskStreak = useMemo(
    () => computeActivityStreak(activityDays),
    [activityDays],
  );
  const todayKey = localDateKey(new Date());
  const todayCaptured = activityDays.get(todayKey)?.captured ?? 0;
  const activeDays12w = useMemo(
    () => activityGrid.flat().filter((c) => !c.isFuture && c.total > 0).length,
    [activityGrid],
  );
  const maxCellTotal = useMemo(
    () => Math.max(1, ...activityGrid.flat().map((c) => c.total)),
    [activityGrid],
  );

  // The due queue is derived from live state; completed cards drop out when
  // their schedule advances, so `sessionDone` counts what this sitting graded.
  const queue = useMemo(() => dueQueue(cards), [cards]);
  const current = queue[0] ?? null;
  const currentPaper = current ? paperById.get(current.evidence.paperId) : null;
  const progressed = Math.min(sessionDone, sessionDone + queue.length);

  const handleGrade = (grade: Grade) => {
    if (!current) return;
    onGrade(current.evidence.id, grade);
    setRevealed(false);
    setSessionDone((n) => n + 1);
    if (queue.length === 1) {
      toast.success("Session clear", {
        description: `Graded ${sessionDone + 1} card${sessionDone === 0 ? "" : "s"} — the queue is empty for today.`,
      });
    }
  };

  /* -------------------------------------------------- empty desk state */
  if (evidence.length === 0) {
    return (
      <div className="bench-card p-12 sm:p-16 text-center max-w-xl mx-auto space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--yellow-wash)] text-[var(--yellow-ink)] hatch">
          <Brain className="h-8 w-8" strokeWidth={2} />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-extrabold font-display">No cards to drill yet</h3>
          <p className="text-sm sm:text-base text-[var(--ink-body)] leading-relaxed">
            Every passage you capture in the Reader becomes a flashcard here —
            verbatim quotes on the front, spaced-repetition scheduling on the
            back. Capture evidence first, then come back to drill it.
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={onNavigateToReader}
            className="btn btn-primary h-11 px-6 text-xs font-mono uppercase tracking-wider"
          >
            <BookOpen className="w-4 h-4" strokeWidth={2.4} />
            <span>Open the Reader</span>
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------- main view */
  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-2.5">
          <Layers className="w-6 h-6 text-[var(--violet-ink)]" strokeWidth={2.2} />
          <span className="stamp-label">
            <span className="stamp-underline">07 · Evidence drill</span>
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight leading-[1.05]">
          Recall the evidence,{" "}
          <span className="marker">keep the receipts</span>.
        </h1>
        <p className="text-sm sm:text-base text-[var(--ink-body)] max-w-2xl leading-relaxed">
          Every captured passage is a card — scheduled by the SM-2 spacing
          algorithm, the same engine Anki uses. Answer from memory, reveal the
          verbatim source, and grade yourself honestly. The spacing does the rest.
        </p>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-cell tone-violet">
          <span className="stat-label">Due now</span>
          <span className="stat-value">{stats.dueNow}</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">Cards total</span>
          <span className="stat-value">{stats.totalCards}</span>
        </div>
        <div className="stat-cell tone-orange">
          <span className="stat-label flex items-center gap-1.5">
            <Flame className="w-3 h-3" strokeWidth={2.4} /> Streak
          </span>
          <span className="stat-value">
            {stats.streakDays}
            <span className="text-sm font-bold"> day{stats.streakDays === 1 ? "" : "s"}</span>
          </span>
        </div>
        <div className="stat-cell tone-green">
          <span className="stat-label flex items-center gap-1.5">
            <Gauge className="w-3 h-3" strokeWidth={2.4} /> 30-day recall
          </span>
          <span className="stat-value">
            {stats.retention30 === null ? "—" : `${Math.round(stats.retention30 * 100)}%`}
          </span>
        </div>
      </div>

      {/* Desk activity — streak calendar + daily goal */}
      <section className="bench-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <CalendarDays className="w-4 h-4 text-[var(--violet-ink)]" strokeWidth={2.2} />
          <h2 className="stamp-label">
            <span className="stamp-underline">Desk activity</span>
          </h2>
          <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
          <span className="ticket ticket-orange !py-0.5">
            <Zap className="w-3 h-3" strokeWidth={2.4} />
            <span>{deskStreak}-day desk streak</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* 12-week streak calendar */}
          <div className="md:col-span-8 space-y-2.5">
            <div className="flex gap-[3px] overflow-x-auto pb-1">
              {activityGrid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  <span className="h-[10px] font-mono text-[7px] font-bold uppercase text-[var(--ink-faint)] leading-none">
                    {week.find((c) => c.monthLabel)?.monthLabel ?? ""}
                  </span>
                  {week.map((cell) => {
                    const level = intensityLevel(cell.total, maxCellTotal);
                    return (
                      <span
                        key={cell.date}
                        title={`${new Date(`${cell.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${cell.total} ${cell.total === 1 ? "action" : "actions"}`}
                        className={`h-[11px] w-[11px] rounded-[3px] border ${
                          cell.isToday
                            ? "border-[var(--orange)] border-2"
                            : "border-[var(--border-soft)]"
                        }`}
                        style={{
                          backgroundColor:
                            level === 0 || cell.isFuture
                              ? "transparent"
                              : `color-mix(in srgb, var(--violet) ${20 + level * 20}%, transparent)`,
                          opacity: cell.isFuture ? 0.35 : 1,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">Quiet</span>
                {[1, 2, 3, 4].map((l) => (
                  <span
                    key={l}
                    className="h-[10px] w-[10px] rounded-[3px] border border-[var(--border-soft)]"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--violet) ${20 + l * 20}%, transparent)`,
                    }}
                  />
                ))}
                <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">Heaviest</span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                {activeDays12w} active {activeDays12w === 1 ? "day" : "days"} · last 12 weeks · captures + grades + screening
              </span>
            </div>
          </div>

          {/* Daily goal */}
          <div className="md:col-span-4 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-[var(--orange-ink)]" strokeWidth={2.4} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Today — {todayCaptured} of {dailyGoal} {dailyGoal === 1 ? "capture" : "captures"}
              </span>
            </div>
            <div
              className="h-3 border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-inset)] overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={dailyGoal}
              aria-valuenow={Math.min(todayCaptured, dailyGoal)}
              aria-label="Daily capture goal"
            >
              <div
                className={`h-full transition-[width] duration-500 ${
                  todayCaptured >= dailyGoal ? "bg-[var(--green)]" : "bg-[var(--orange)]"
                }`}
                style={{
                  width: `${Math.min(100, (todayCaptured / dailyGoal) * 100)}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Goal
              </span>
              {[1, 3, 5, 7, 10].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => changeGoal(g)}
                  className={`btn btn-chip text-[9.5px] font-mono font-bold ${
                    dailyGoal === g ? "btn-ink" : "btn-ghost"
                  }`}
                  aria-pressed={dailyGoal === g}
                >
                  {g}
                </button>
              ))}
            </div>
            {todayCaptured >= dailyGoal && (
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--green-ink)] leading-relaxed">
                <CheckCircle2 className="w-3 h-3 inline mr-1 -mt-0.5" strokeWidth={2.4} />
                Goal met — every extra capture compounds the streak.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Session progress */}
      {queue.length > 0 && (
        <div className="bench-card !p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Session · {queue.length} card{queue.length === 1 ? "" : "s"} left
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[var(--green-ink)]" strokeWidth={2.4} />
              {stats.reviewsToday} graded today
            </span>
          </div>
          <div
            className="h-3 border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-inset)] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progressed || 1}
            aria-valuenow={sessionDone}
            aria-label="Session progress"
          >
            <div
              className="h-full bg-[var(--violet)] transition-[width] duration-500"
              style={{
                width: `${progressed > 0 ? Math.min(100, (sessionDone / progressed) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Flashcard */}
      {current ? (
        <article
          key={current.evidence.id}
          className="bench-card !p-0 overflow-hidden"
          aria-label="Flashcard"
        >
          {/* Card front */}
          <div className="p-6 sm:p-8 border-b-2 border-dotted border-[var(--border-soft)]">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="ticket ticket-magenta">{current.evidence.field}</span>
              <span
                className={`ticket ${current.isNew ? "ticket-violet" : current.evidence.kind === "author passage" ? "ticket-cyan" : "ticket-yellow"}`}
              >
                {current.isNew
                  ? "New card"
                  : current.evidence.kind === "author passage"
                    ? "Author passage"
                    : "Researcher note"}
              </span>
              {!current.isNew && (
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)]">
                  reps {current.schedule.reps} · ease {current.schedule.ease.toFixed(2)}
                  {current.schedule.lapses > 0 ? ` · ${current.schedule.lapses} lapse${current.schedule.lapses === 1 ? "" : "s"}` : ""}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold font-display leading-snug text-[var(--ink-heading)]">
              {cardFront(current.evidence, currentPaper?.title ?? "Unknown paper")}
            </h2>
            {currentPaper && (
              <p className="mt-2 text-[13px] italic text-[var(--ink-muted)]">
                {currentPaper.authors[0] ?? "Unknown"}
                {currentPaper.authors.length > 1 ? " et al." : ""}
                {currentPaper.year ? ` · ${currentPaper.year}` : ""}
                {currentPaper.venue ? ` · ${currentPaper.venue.slice(0, 60)}` : ""}
              </p>
            )}
          </div>

          {/* Card back / reveal */}
          {revealed ? (
            <div className="p-6 sm:p-8 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <span className="stamp-label">
                  <span className="stamp-underline">
                    {current.evidence.kind === "author passage" ? "Verbatim source" : "Your note"}
                  </span>
                </span>
                <blockquote className="border-l-4 border-[var(--violet)] bg-[var(--violet-wash)] px-4 py-3 text-base leading-relaxed text-[var(--ink-heading)]">
                  “{cardBack(current.evidence)}”
                </blockquote>
                <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
                  Captured {new Date(current.evidence.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Grade buttons */}
              <div className="space-y-2.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)] block">
                  How well did you recall it?
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {([0, 3, 4, 5] as Grade[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleGrade(g)}
                      className={`btn ${GRADE_STYLES[g]} btn-chip h-11 flex-col !gap-0.5`}
                      aria-label={`${GRADE_LABELS[g]} — next in ${formatInterval(previewInterval(current.schedule, g))}`}
                    >
                      <span className="text-[12px] font-bold uppercase tracking-wider">
                        {GRADE_LABELS[g]}
                      </span>
                      <span className="font-mono text-[10px] opacity-80">
                        {formatInterval(previewInterval(current.schedule, g))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-[var(--ink-muted)] max-w-md leading-relaxed">
                Answer out loud from memory first — then reveal the source and
                grade yourself. {" "}
                <span className="text-[var(--ink-body)] font-bold">
                  Honesty is the algorithm.
                </span>
              </p>
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="btn btn-primary h-11 px-8 text-xs font-mono uppercase tracking-wider"
                autoFocus
              >
                <Eye className="w-4 h-4" strokeWidth={2.4} />
                <span>Reveal the source</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleSuspend(current.evidence.id)}
                  className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                  title="Suspend this card — remove it from rotation without deleting evidence"
                >
                  <PauseCircle className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span>Suspend card</span>
                </button>
                {currentPaper && (
                  <button
                    type="button"
                    onClick={() => onOpenPaper(currentPaper)}
                    className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                  >
                    <BookOpen className="w-3.5 h-3.5" strokeWidth={2.2} />
                    <span>Open paper</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </article>
      ) : (
        <div className="bench-card p-10 sm:p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center border-2 border-[var(--green)] rounded-[var(--radius-cut)] bg-[var(--green-wash)] text-[var(--green-ink)]">
            <CheckCircle2 className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <h3 className="text-2xl font-extrabold font-display">
            {stats.suspended > 0 ? "Nothing due right now" : "Queue clear for today"}
          </h3>
          <p className="text-sm text-[var(--ink-body)] max-w-md mx-auto leading-relaxed">
            {sessionDone > 0
              ? `You graded ${sessionDone} card${sessionDone === 1 ? "" : "s"} this session. `
              : ""}
            The scheduler will bring cards back exactly when you are about to
            forget them — come back tomorrow, or capture more evidence in the Reader.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onNavigateToReader}
              className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              <BookOpen className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Capture more evidence</span>
            </button>
          </div>
        </div>
      )}

      {/* Card browser */}
      <section className="bench-card !p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] bg-[var(--bg-paper-dim)] px-4 sm:px-5 py-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBrowseTab("queue")}
              className={`btn btn-chip text-[10px] font-mono uppercase tracking-wider ${browseTab === "queue" ? "btn-ink" : "btn-ghost"}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Due ({stats.dueNow})</span>
            </button>
            <button
              type="button"
              onClick={() => setBrowseTab("all")}
              className={`btn btn-chip text-[10px] font-mono uppercase tracking-wider ${browseTab === "all" ? "btn-ink" : "btn-ghost"}`}
            >
              <Layers className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>All cards ({stats.totalCards})</span>
            </button>
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)] hidden sm:block">
            SM-2 scheduler · Anki-compatible
          </span>
        </div>

        <div className="bench-scroll max-h-96 overflow-y-auto">
          <table className="bench-table">
            <thead>
              <tr>
                <th className="text-left">Prompt</th>
                <th className="text-left hidden md:table-cell">Paper</th>
                <th className="text-center">Due</th>
                <th className="text-center hidden sm:table-cell">Interval</th>
                <th className="text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {(browseTab === "queue"
                ? cards.filter((c) => c.due)
                : [...cards].sort(
                    (a, b) =>
                      Date.parse(a.schedule.dueAt) - Date.parse(b.schedule.dueAt),
                  )
              )
                .slice(0, 100)
                .map((c) => {
                  const paper = paperById.get(c.evidence.paperId);
                  const dueDate = new Date(c.schedule.dueAt);
                  const overdue = c.due && !c.isNew;
                  return (
                    <tr key={c.evidence.id}>
                      <td className="text-left max-w-[280px]">
                        <span className="line-clamp-1 font-bold text-[var(--ink-heading)]">
                          {cardFront(c.evidence, paper?.title ?? "Unknown")}
                        </span>
                      </td>
                      <td className="text-left hidden md:table-cell max-w-[180px]">
                        <span className="line-clamp-1 italic text-[12px]">
                          {paper?.title ?? "Unknown paper"}
                        </span>
                      </td>
                      <td className="text-center font-mono text-[12px] font-bold">
                        {c.schedule.suspended ? (
                          <span className="text-[var(--ink-muted)]">—</span>
                        ) : c.isNew ? (
                          <span className="text-[var(--violet-ink)]">new</span>
                        ) : overdue ? (
                          <span className="text-[var(--orange-ink)]">
                            {dueDate.toLocaleDateString()}
                          </span>
                        ) : (
                          dueDate.toLocaleDateString()
                        )}
                      </td>
                      <td className="text-center font-mono text-[12px] hidden sm:table-cell">
                        {c.schedule.reps > 0
                          ? formatInterval(c.schedule.intervalDays)
                          : "—"}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => onToggleSuspend(c.evidence.id)}
                          className={`btn btn-chip text-[9.5px] font-mono uppercase tracking-wider ${
                            c.schedule.suspended ? "btn-accent-yellow !shadow-none" : "btn-ghost"
                          }`}
                          title={c.schedule.suspended ? "Resume this card" : "Suspend this card"}
                        >
                          {c.schedule.suspended ? (
                            <>
                              <PlayCircle className="w-3 h-3" strokeWidth={2.2} />
                              <span>Resume</span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-3 h-3" strokeWidth={2.2} />
                              <span>Suspend</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <p className="border-t-2 border-dotted border-[var(--border-soft)] px-4 sm:px-5 py-3 font-mono text-[9.5px] uppercase tracking-wider leading-relaxed text-[var(--ink-muted)]">
          <RotateCcw className="w-3 h-3 inline mr-1.5 -mt-0.5" strokeWidth={2.2} />
          Cards are evidence — suspend hides them from drilling; delete the
          evidence in the Reader to remove a card for good.
        </p>
      </section>
    </div>
  );
}
