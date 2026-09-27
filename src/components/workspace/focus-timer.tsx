"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Square, Timer, Quote } from "lucide-react";
import { toast } from "sonner";

interface FocusTimerOverlayProps {
  paperTitle: string;
  /** Evidence records captured since the session started (live counter). */
  capturedCount: number;
  onEnd: (completed: boolean) => void;
}

/**
 * Focus session — a Pomodoro that greys out everything but the desk.
 *
 * The timer is deliberately isolated from the reading surface: no inputs are
 * blocked (you can still highlight and capture — that's the point), but the
 * overlay owns the visual field so wandering tabs feel like leaving the room.
 */
export function FocusTimerOverlay({
  paperTitle,
  capturedCount,
  onEnd,
}: FocusTimerOverlayProps) {
  const [remaining, setRemaining] = useState(25 * 60);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);

  // One-second tick; stops when paused or finished.
  useEffect(() => {
    if (paused || ended) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setEnded(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused, ended]);

  // Completion notice — exactly once.
  useEffect(() => {
    if (!ended) return;
    toast.success("Focus session complete", {
      description: "25 minutes on the desk. Stand up, look far away, breathe.",
    });
  }, [ended]);

  const total = 25 * 60;
  const progress = 1 - remaining / total;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const R = 86;
  const C = 2 * Math.PI * R;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--bg-desk)]/92 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Focus session in progress"
    >
      <div className="bench-card w-full max-w-lg p-7 sm:p-9 space-y-6 text-center shadow-[6px_6px_0_var(--border-ink)]">
        <div className="flex items-center justify-center gap-2.5">
          <Timer className="w-4 h-4 text-[var(--orange-ink)]" strokeWidth={2.4} />
          <span className="stamp-label">
            <span className="stamp-underline">Focus session</span>
          </span>
        </div>

        {/* Countdown ring */}
        <div className="relative mx-auto w-[220px] h-[220px]">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border-soft)" strokeWidth="7" />
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={ended ? "var(--green)" : "var(--orange)"}
              strokeWidth="7"
              strokeLinecap="butt"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="font-mono text-[44px] font-bold tabular-nums text-[var(--ink-heading)] leading-none">
              {ended ? "00:00" : `${minutes}:${`${seconds}`.padStart(2, "0")}`}
            </span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              {ended ? "Session complete" : paused ? "Paused" : "On the clock"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-base font-extrabold font-display leading-snug text-[var(--ink-heading)]">
            {paperTitle}
          </p>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            Reading desk · highlight &amp; capture as you go
          </p>
        </div>

        {/* Session tally */}
        <div className="flex items-center justify-center gap-2.5">
          <span className="ticket ticket-green py-1.5 px-3">
            <Quote className="w-3 h-3" strokeWidth={2.4} />
            <span>
              {capturedCount} {capturedCount === 1 ? "capture" : "captures"} this session
            </span>
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          {!ended && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="btn btn-ink btn-chip h-10 px-5 text-[11px] font-mono uppercase tracking-wider"
            >
              {paused ? (
                <Play className="w-3.5 h-3.5" strokeWidth={2.4} />
              ) : (
                <Pause className="w-3.5 h-3.5" strokeWidth={2.4} />
              )}
              <span>{paused ? "Resume" : "Pause"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onEnd(ended)}
            className="btn btn-primary h-10 px-5 text-[11px] font-mono uppercase tracking-wider"
          >
            <Square className="w-3.5 h-3.5" strokeWidth={2.4} />
            <span>{ended ? "Back to the desk" : "End session"}</span>
          </button>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)] leading-relaxed">
          The information-overload literature is unambiguous: bounded, goal-directed
          reading beats open-ended scrolling. This is the bound.
        </p>
      </div>
    </div>
  );
}
