"use client";

import { useState, type FormEvent } from "react";
import {
  Bell,
  CheckCircle2,
  Bookmark,
  Plus,
  Trash2,
  BookOpen,
  ExternalLink,
  FileText,
  Search,
  Check,
  Radio,
  Loader2,
} from "lucide-react";
import type { Workspace } from "@/lib/workspace/schema";
import type { Paper } from "./paper-card";
import { resolvePaperAccess } from "./source-resolver";

interface UpdatesViewProps {
  inbox: Workspace["inbox"];
  alerts: Workspace["alerts"];
  onMarkRead: (inboxId: string) => void;
  onMarkAllRead: () => void;
  onCreateAlert: (query: string, frequency: "daily" | "weekly") => void;
  onDeleteAlert: (alertId: string) => void;
  onRunAlert: (alertId: string) => Promise<{ found: number; error?: string }>;
  onOpenReader: (paper: Paper) => void;
  onToggleSave: (paper: Paper) => void;
  savedPaperIds: Set<string>;
}

export function UpdatesView({
  inbox,
  alerts,
  onMarkRead,
  onMarkAllRead,
  onCreateAlert,
  onDeleteAlert,
  onRunAlert,
  onOpenReader,
  onToggleSave,
  savedPaperIds,
}: UpdatesViewProps) {
  const [newAlertQuery, setNewAlertQuery] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, { found: number; error?: string }>>({});

  const unreadCount = inbox.filter((i) => !i.read).length;

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newAlertQuery.trim()) return;
    onCreateAlert(newAlertQuery.trim(), frequency);
    setNewAlertQuery("");
  };

  const handleRun = async (alertId: string) => {
    setRunningId(alertId);
    setRunResult((prev) => ({ ...prev, [alertId]: { found: 0 } }));
    try {
      const result = await onRunAlert(alertId);
      setRunResult((prev) => ({ ...prev, [alertId]: result }));
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-7">
      {/* ============ SECTION MASTHEAD ============ */}
      <div className="space-y-3 animate-rise">
        <div className="flex flex-wrap items-center gap-3">
          <span className="stamp-label">
            <span className="stamp-num">06</span> / Alerts
          </span>
          <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
          <span className={`ticket ${unreadCount > 0 ? "ticket-orange" : ""}`}>
            {unreadCount > 0 && <span className="live-dot" style={{ width: 5, height: 5 }} />}
            <span>{unreadCount} unread · {alerts.length} alerts</span>
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold font-display leading-[1.05]">
          Living searches &{" "}
          <span className="text-[var(--orange-ink)]">updates.</span>
        </h1>
        <p className="text-[var(--ink-body)] text-base max-w-2xl leading-relaxed">
          Standing queries that sweep the scholarly repositories whenever you press
          &ldquo;Check now&rdquo;. New matches land in the inbox; alerts keep running
          until you delete them.
        </p>
      </div>

      {/* ============ TWO-COLUMN WORKSPACE ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ---------- LEFT: INBOX ---------- */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="stamp-label">
              <span className="stamp-underline">Inbox</span>
            </h3>
            <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
              {inbox.length} items · {unreadCount} unread
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green-ink)]" strokeWidth={2.2} />
                Mark all read
              </button>
            )}
          </div>

          {inbox.length > 0 && (
            <div className="stat-cell tone-orange">
              <span className="stat-label">Unread matches</span>
              <span className="stat-value">{unreadCount}</span>
              <span className="stat-sub">awaiting your review</span>
            </div>
          )}

          {inbox.length > 0 ? (
            <div className="bench-scroll space-y-3 max-h-96 overflow-y-auto pr-1">
              {inbox.map((item) => {
                const paper = item.paper;
                const isSaved = savedPaperIds.has(paper.id);
                const access = resolvePaperAccess(paper);
                const alert = alerts.find((a) => a.id === item.alertId);
                return (
                  <article
                    key={item.id}
                    className={`paper-slip p-4 sm:p-5 space-y-3 ${item.read ? "opacity-60" : ""}`}
                  >
                    {/* Header row — dot, matched alert, discoveredAt, mark read */}
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider">
                      <span
                        className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                          !item.read ? "bg-[var(--orange)]" : "bg-[var(--ink-faint)]"
                        }`}
                        aria-hidden="true"
                      />
                      {alert && (
                        <span
                          className="text-[var(--orange-ink)] font-bold truncate max-w-[260px]"
                          title={alert.query}
                        >
                          Match · &ldquo;{alert.query}&rdquo;
                        </span>
                      )}
                      <span className="text-[var(--ink-muted)]">
                        {new Date(item.discoveredAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </span>
                      <span className="ml-auto">
                        {!item.read && (
                          <button
                            type="button"
                            onClick={() => onMarkRead(item.id)}
                            className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
                          >
                            <Check className="w-3 h-3" strokeWidth={2.6} />
                            Mark read
                          </button>
                        )}
                      </span>
                    </div>

                    {/* Title */}
                    <h3
                      onClick={() => onOpenReader(paper)}
                      className="text-base sm:text-lg font-bold font-display leading-snug cursor-pointer hover:underline decoration-[var(--cyan)] decoration-2 underline-offset-4 transition-colors line-clamp-2"
                    >
                      {paper.title}
                    </h3>

                    {/* Metadata */}
                    <p className="font-mono text-[10.5px] text-[var(--ink-muted)] uppercase tracking-wider">
                      {paper.authors.length > 0
                        ? `${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}`
                        : "Unknown authors"}
                      {paper.year ? ` · ${paper.year}` : ""}
                      {paper.venue ? ` · ${paper.venue}` : ""}
                    </p>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenReader(paper)}
                        className="btn btn-primary btn-chip text-[10px] font-mono uppercase tracking-wider"
                      >
                        <BookOpen className="w-3.5 h-3.5" strokeWidth={2.4} />
                        Reader
                      </button>
                      {access.primaryAction && (
                        <a
                          href={access.primaryAction.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`btn btn-chip text-[10px] font-mono uppercase tracking-wider ${
                            access.hasDirectPdf ? "btn-accent-green" : "btn-ghost"
                          }`}
                        >
                          {access.hasDirectPdf && (
                            <FileText className="w-3.5 h-3.5" strokeWidth={2.2} />
                          )}
                          <span>{access.primaryAction.label}</span>
                          <ExternalLink className="w-3 h-3 opacity-70" strokeWidth={2.4} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleSave(paper)}
                        className={`btn btn-chip text-[10px] font-mono uppercase tracking-wider ${
                          isSaved ? "btn-accent-yellow !shadow-none" : "btn-ghost"
                        }`}
                        title={isSaved ? "Saved to library" : "Save to library"}
                        aria-pressed={isSaved}
                      >
                        <Bookmark
                          className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`}
                          strokeWidth={2.2}
                        />
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="bench-card p-8 sm:p-10 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--orange-wash)] text-[var(--orange-ink)] hatch">
                <Bell className="h-7 w-7" strokeWidth={2} />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-lg sm:text-xl font-extrabold font-display">
                  The inbox is quiet
                </h4>
                <p className="text-sm text-[var(--ink-body)] leading-relaxed max-w-md mx-auto">
                  Create a standing query on the right, then press &ldquo;Check now&rdquo;
                  — every newly discovered record lands here for your review.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ---------- RIGHT: ALERTS MANAGEMENT ---------- */}
        <section className="lg:col-span-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="stamp-label">
              <span className="stamp-underline">Standing queries</span>
            </h3>
            <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
              {alerts.length} active
            </span>
          </div>

          {/* New alert form */}
          <form onSubmit={handleCreate} className="bench-card p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-[var(--orange-ink)]" strokeWidth={2.2} />
              <h4 className="stamp-label">
                <span className="stamp-underline">New standing query</span>
              </h4>
            </div>

            <div className="search-bar flex items-center gap-2 px-3 !shadow-none">
              <Search className="w-4 h-4 text-[var(--cyan-ink)] shrink-0" strokeWidth={2.4} />
              <input
                type="text"
                required
                value={newAlertQuery}
                onChange={(e) => setNewAlertQuery(e.target.value)}
                placeholder="Topic or phrase to monitor…"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none placeholder:text-[var(--ink-faint)] text-sm py-2.5"
                aria-label="Alert query"
              />
            </div>

            <div className="space-y-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Cadence
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFrequency("daily")}
                  className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                    frequency === "daily" ? "btn-primary" : "btn-ghost"
                  }`}
                  aria-pressed={frequency === "daily"}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency("weekly")}
                  className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                    frequency === "weekly" ? "btn-accent-green" : "btn-ghost"
                  }`}
                  aria-pressed={frequency === "weekly"}
                >
                  Weekly
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-1">
              <button
                type="submit"
                disabled={!newAlertQuery.trim()}
                className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
                Create alert
              </button>
            </div>
          </form>

          {/* Alerts list or empty state */}
          {alerts.length > 0 ? (
            <div className="bench-scroll space-y-3 max-h-96 overflow-y-auto pr-1">
              {alerts.map((al) => {
                const isRunning = runningId === al.id;
                const result = runResult[al.id];
                return (
                  <article key={al.id} className="paper-slip !border-[var(--orange)] p-4 sm:p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <h4 className="text-base font-bold font-display leading-snug line-clamp-2">
                          {al.query}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider">
                          <span className={`ticket ${al.frequency === "daily" ? "ticket-cyan" : "ticket-green"}`}>
                            <span>{al.frequency}</span>
                          </span>
                          <span>
                            Last check:{" "}
                            {al.lastRunAt
                              ? new Date(al.lastRunAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Never"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteAlert(al.id)}
                        className="btn btn-ghost btn-chip !p-1.5 hover:!border-[var(--red)] hover:!text-[var(--red-ink)] shrink-0"
                        title="Delete alert"
                        aria-label={`Delete alert: ${al.query}`}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2.2} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleRun(al.id)}
                        disabled={isRunning}
                        className="btn btn-accent-orange btn-chip text-[10.5px] font-mono uppercase tracking-wider"
                        title="Query the live repositories for new matches now"
                      >
                        {isRunning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.4} />
                        ) : (
                          <Radio className="w-3.5 h-3.5" strokeWidth={2.2} />
                        )}
                        <span>{isRunning ? "Checking…" : "Check now"}</span>
                      </button>
                      {result && !isRunning && (
                        <span
                          className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                            result.error ? "text-[var(--red-ink)]" : "text-[var(--green-ink)]"
                          }`}
                          role="status"
                        >
                          {result.error
                            ? result.error
                            : result.found === 0
                              ? "Up to date — nothing new"
                              : `${result.found} new ${result.found === 1 ? "record" : "records"} delivered`}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="bench-card p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper-dim)] text-[var(--ink-muted)] hatch">
                <Radio className="h-6 w-6" strokeWidth={2} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold font-display">
                  No standing queries yet
                </h4>
                <p className="text-xs text-[var(--ink-body)] leading-relaxed max-w-xs mx-auto">
                  Compose a query above to start monitoring a topic. Saved alerts
                  appear here with a &ldquo;Check now&rdquo; control.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
