"use client";

import { useMemo, useState } from "react";
import {
  PenLine,
  Link2,
  Unlink,
  Trash2,
  FileDown,
  ClipboardCopy,
  FileText,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  Search,
  CornerDownRight,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import type { Paper, Evidence } from "./paper-card";
import type { Claim, ClaimStance } from "@/lib/workspace/schema";
import {
  claimStatus,
  coverageReport,
  coverageScore,
  stanceTally,
  buildOutline,
  STANCE_LABELS,
} from "@/lib/workspace/argument";

interface BuilderViewProps {
  claims: Claim[];
  evidence: Evidence[];
  papers: Paper[];
  onCreateClaim: (text: string) => void;
  onUpdateClaimText: (claimId: string, text: string) => void;
  onUpdateClaimNotes: (claimId: string, notes: string) => void;
  onDeleteClaim: (claimId: string) => void;
  onAttachEvidence: (claimId: string, evidenceId: string, stance: ClaimStance) => void;
  onSetStance: (claimId: string, evidenceId: string, stance: ClaimStance) => void;
  onDetachEvidence: (claimId: string, evidenceId: string) => void;
  onSetLinkNote: (claimId: string, evidenceId: string, note: string) => void;
  onOpenPaper: (paper: Paper) => void;
  onNavigateToReader: () => void;
  onNavigateToDiscover: () => void;
}

const STATUS_STAMPS: Record<
  ReturnType<typeof claimStatus>,
  { label: string; icon: typeof CheckCircle2; cls: string }
> = {
  supported: { label: "Backed", icon: CheckCircle2, cls: "ticket-green" },
  contested: { label: "Contested", icon: AlertTriangle, cls: "ticket-red" },
  qualified: { label: "Qualified", icon: CircleDot, cls: "ticket-yellow" },
  unbacked: { label: "Unbacked", icon: CircleDashed, cls: "ticket" },
};

const STANCE_ORDER: ClaimStance[] = ["support", "qualify", "contradict"];
const STANCE_BTN: Record<ClaimStance, string> = {
  support: "btn-accent-green",
  qualify: "btn-accent-yellow",
  contradict: "btn-accent-red",
};

function StancePicker({
  stance,
  onSelect,
  size = "sm",
}: {
  stance: ClaimStance;
  onSelect: (s: ClaimStance) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label="Stance of this evidence toward the claim"
    >
      {STANCE_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className={`btn btn-chip ${
            size === "xs" ? "!px-1.5 !py-0.5 text-[8.5px]" : "!px-2 text-[9.5px]"
          } font-mono font-bold uppercase tracking-wider ${
            stance === s ? `${STANCE_BTN[s]} !shadow-none` : "btn-ghost"
          }`}
          aria-pressed={stance === s}
          title={STANCE_LABELS[s]}
        >
          {s === "support" ? "Sup" : s === "qualify" ? "Qual" : "Contra"}
        </button>
      ))}
    </div>
  );
}

export function BuilderView({
  claims,
  evidence,
  papers,
  onCreateClaim,
  onUpdateClaimText,
  onUpdateClaimNotes,
  onDeleteClaim,
  onAttachEvidence,
  onSetStance,
  onDetachEvidence,
  onSetLinkNote,
  onOpenPaper,
  onNavigateToReader,
  onNavigateToDiscover,
}: BuilderViewProps) {
  const [claimDraft, setClaimDraft] = useState("");
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [linkNoteDrafts, setLinkNoteDrafts] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState("");
  const [showOutline, setShowOutline] = useState(false);

  const paperById = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);
  const evidenceById = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence]);

  // Which claims each piece of evidence already backs (for pool badges)
  const attachmentsByEvidence = useMemo(() => {
    const map = new Map<string, Array<{ claimId: string; index: number }>>();
    claims.forEach((claim, i) => {
      for (const link of claim.evidence) {
        const list = map.get(link.evidenceId) ?? [];
        list.push({ claimId: claim.id, index: i + 1 });
        map.set(link.evidenceId, list);
      }
    });
    return map;
  }, [claims]);

  const selectedClaim = claims.find((c) => c.id === selectedClaimId) ?? null;
  const attachedCount = claims.reduce((n, c) => n + c.evidence.length, 0);
  const contestedCount = claims.filter((c) => claimStatus(c) === "contested").length;
  const coverage = coverageScore(claims);
  const issues = coverageReport(claims);
  const outline = useMemo(
    () => buildOutline({ evidence, papers }, claims),
    [evidence, papers, claims],
  );

  const filteredPool = useMemo(() => {
    const q = poolFilter.trim().toLowerCase();
    if (!q) return evidence;
    return evidence.filter((e) => {
      const paper = paperById.get(e.paperId);
      return (
        e.statement.toLowerCase().includes(q) ||
        e.field.toLowerCase().includes(q) ||
        (paper?.title.toLowerCase().includes(q) ?? false)
      );
    });
  }, [evidence, poolFilter, paperById]);

  const handleCreate = () => {
    const text = claimDraft.trim();
    if (!text) return;
    if (claims.length >= 100) {
      toast.warning("Claim board is full", { description: "Keep the argument tight — 100 claims is plenty." });
      return;
    }
    onCreateClaim(text);
    setClaimDraft("");
  };

  const handleCopyOutline = async () => {
    try {
      await navigator.clipboard.writeText(outline);
      toast.success("Outline copied", { description: "Markdown with inline verbatim receipts and citations." });
    } catch {
      toast.error("Could not reach the clipboard", { description: "Use the download button instead." });
    }
  };

  const handleDownloadOutline = () => {
    const blob = new Blob([outline], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kivo-outline-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Outline downloaded", { description: "Markdown, ready for any editor or Overleaf hand-off." });
  };

  /* -------------------------------------------------- empty evidence state */
  if (evidence.length === 0) {
    return (
      <div className="bench-card p-12 sm:p-16 text-center max-w-xl mx-auto space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--cyan-wash)] text-[var(--cyan-ink)] hatch">
          <PenLine className="h-8 w-8" strokeWidth={2} />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-extrabold font-display">The builder runs on receipts</h3>
          <p className="text-sm sm:text-base text-[var(--ink-body)] leading-relaxed">
            A claim without evidence is just an opinion with better formatting.
            Capture passages in the Reader first — every verbatim receipt you
            save becomes a brick this view can lay.
          </p>
        </div>
        <div className="pt-2 flex flex-wrap justify-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateToReader}
            className="btn btn-primary h-11 px-6 text-xs font-mono uppercase tracking-wider"
          >
            <BookOpen className="w-4 h-4" strokeWidth={2.4} />
            <span>Open the Reader</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToDiscover}
            className="btn btn-ghost h-11 px-6 text-xs font-mono uppercase tracking-wider"
          >
            <Search className="w-4 h-4" strokeWidth={2.4} />
            <span>Find papers</span>
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
          <PenLine className="w-6 h-6 text-[var(--magenta-ink)]" strokeWidth={2.2} />
          <span className="stamp-label">
            <span className="stamp-underline">09 · Argument builder</span>
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight leading-[1.05]">
          Build the argument,{" "}
          <span className="marker">not the pile</span>.
        </h1>
        <p className="text-sm sm:text-base text-[var(--ink-body)] max-w-2xl leading-relaxed">
          State the claims your review must defend, then attach the receipts
          you already captured — each marked as <strong>supporting</strong>,{" "}
          <strong>qualifying</strong>, or <strong>contradicting</strong>. KIVO
          tracks which claims still stand on assertions, and exports the whole
          structure as a citable outline. Nothing here can be faked: every
          quote is one the evidence desk can verify.
        </p>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-cell">
          <span className="stat-label">Claims</span>
          <span className="stat-value">{claims.length}</span>
        </div>
        <div className="stat-cell tone-cyan">
          <span className="stat-label flex items-center gap-1.5">
            <Link2 className="w-3 h-3" strokeWidth={2.4} /> Receipts attached
          </span>
          <span className="stat-value">{attachedCount}</span>
        </div>
        <div className="stat-cell tone-green">
          <span className="stat-label">Coverage</span>
          <span className="stat-value">
            {claims.length === 0 ? "—" : `${Math.round(coverage * 100)}%`}
          </span>
          <span className="stat-sub">claims with clean support</span>
        </div>
        <div className={`stat-cell ${contestedCount > 0 ? "tone-orange" : ""}`}>
          <span className="stat-label flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" strokeWidth={2.4} /> Contested
          </span>
          <span className="stat-value">{contestedCount}</span>
          <span className="stat-sub">
            {contestedCount > 0 ? "claims facing contradiction" : "no contradictions yet"}
          </span>
        </div>
      </div>

      {/* Coverage warnings */}
      {issues.length > 0 && (
        <section className="bench-card p-5 space-y-3 !border-[var(--yellow)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--yellow-ink)]" strokeWidth={2.2} />
            <h2 className="stamp-label">
              <span className="stamp-underline">What a marker would circle</span>
            </h2>
            <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            <span className="ticket ticket-yellow !py-0.5">{issues.length} open {issues.length === 1 ? "issue" : "issues"}</span>
          </div>
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.claimId}
                className="receipt-row border-l-[3px] !border-l-[var(--yellow)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClaimId(issue.claimId);
                    document.getElementById(`claim-${issue.claimId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="text-left w-full"
                  title="Jump to this claim"
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--yellow-ink)]">
                    Claim {issue.claimIndex} · {STATUS_STAMPS[issue.status].label}
                  </p>
                  <p className="text-[13px] text-[var(--ink-body)] leading-relaxed mt-0.5">
                    {issue.message}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Two-pane workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ============== LEFT: CLAIMS ============== */}
        <div className="xl:col-span-7 space-y-5">
          {/* Composer */}
          <section className="bench-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <CornerDownRight className="w-4 h-4 text-[var(--magenta-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">State a claim</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)] hidden sm:block">
                one sentence · defensible · specific
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <textarea
                value={claimDraft}
                onChange={(e) => setClaimDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="e.g. Attention-only architectures outperform recurrent baselines on long sequences…"
                rows={2}
                maxLength={2000}
                className="field-input flex-1 resize-y min-h-[72px] font-display !text-[15px]"
                aria-label="New claim text"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!claimDraft.trim()}
                className="btn btn-primary h-11 px-5 text-xs font-mono uppercase tracking-wider sm:self-end disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PenLine className="w-4 h-4" strokeWidth={2.4} />
                <span>Add claim</span>
              </button>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              Enter adds the claim · Shift+Enter for a new line
            </p>
          </section>

          {/* Claim cards */}
          {claims.length === 0 ? (
            <div className="bench-card p-8 sm:p-10 text-center space-y-3 hatch">
              <p className="font-display text-xl font-bold text-[var(--ink-heading)]">
                The board is empty
              </p>
              <p className="text-sm text-[var(--ink-body)] leading-relaxed max-w-md mx-auto">
                Write your first claim above — the review question your project
                already states is a good seed. Then attach receipts from the
                pool on the right.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {claims.map((claim, index) => {
                const status = claimStatus(claim);
                const tally = stanceTally(claim);
                const stamp = STATUS_STAMPS[status];
                const StampIcon = stamp.icon;
                const isSelected = selectedClaimId === claim.id;
                const textDraft = textDrafts[claim.id] ?? claim.text;
                const noteDraft = noteDrafts[claim.id] ?? claim.notes;
                return (
                  <section
                    key={claim.id}
                    id={`claim-${claim.id}`}
                    className={`bench-card claim-card ${isSelected ? "is-selected" : ""} ${
                      status === "contested" ? "!border-[var(--red)]" : status === "unbacked" ? "opacity-90" : ""
                    }`}
                  >
                    {/* Beam: claim text row */}
                    <div className="claim-beam flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-[11px] font-bold text-[var(--ink-faint)]">
                        C{String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={`ticket ${stamp.cls} !py-0.5`}>
                        <StampIcon className="w-3 h-3" strokeWidth={2.4} />
                        <span>{stamp.label}</span>
                      </span>
                      {tally.support + tally.qualify + tally.contradict > 0 && (
                        <span className="flex items-center gap-1.5">
                          {tally.support > 0 && <span className="ticket ticket-green !py-0.5">{tally.support} sup</span>}
                          {tally.qualify > 0 && <span className="ticket ticket-yellow !py-0.5">{tally.qualify} qual</span>}
                          {tally.contradict > 0 && <span className="ticket ticket-red !py-0.5">{tally.contradict} contra</span>}
                        </span>
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedClaimId(isSelected ? null : claim.id)
                        }
                        className={`btn btn-chip !px-2 text-[9.5px] font-mono font-bold uppercase tracking-wider ${
                          isSelected ? "btn-accent-magenta !shadow-none" : "btn-ghost"
                        }`}
                        aria-pressed={isSelected}
                        title={isSelected ? "Stop attaching to this claim" : "Select to receive evidence from the pool"}
                      >
                        <CornerDownRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                        <span>{isSelected ? "Receiving" : "Select"}</span>
                      </button>
                      {confirmDelete === claim.id ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteClaim(claim.id);
                              setConfirmDelete(null);
                              if (selectedClaimId === claim.id) setSelectedClaimId(null);
                            }}
                            className="btn btn-accent-red btn-chip !px-2 text-[9.5px] font-mono uppercase tracking-wider"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Really delete</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="btn btn-ghost btn-chip !px-2 text-[9.5px] font-mono uppercase tracking-wider"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(claim.id)}
                          className="btn btn-ghost btn-chip !px-2"
                          title="Delete this claim"
                          aria-label={`Delete claim ${index + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Claim text (inline editable) */}
                    <div className="p-5 pt-4">
                      <textarea
                        value={textDraft}
                        onChange={(e) =>
                          setTextDrafts((prev) => ({ ...prev, [claim.id]: e.target.value }))
                        }
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== claim.text) onUpdateClaimText(claim.id, next);
                          setTextDrafts((prev) => {
                            const { [claim.id]: _drop, ...rest } = prev;
                            return next === claim.text ? rest : prev;
                          });
                        }}
                        rows={2}
                        maxLength={2000}
                        aria-label={`Claim ${index + 1} text`}
                        className="field-input w-full resize-y min-h-[56px] font-display !text-[16px] sm:!text-[17px] font-bold !border-2"
                      />

                      {/* Attached receipts — the Toulmin map */}
                      <div className="mt-4 space-y-2.5">
                        {claim.evidence.length === 0 ? (
                          <div className="hatch-row border-2 border-dashed border-[var(--border-soft)] rounded-[var(--radius-cut)] px-4 py-3.5 flex items-center gap-2.5">
                            <CircleDashed className="w-4 h-4 text-[var(--ink-faint)]" strokeWidth={2.2} />
                            <p className="text-[12.5px] text-[var(--ink-muted)]">
                              No receipts yet — select this claim, then attach evidence from the pool.
                            </p>
                          </div>
                        ) : (
                          claim.evidence.map((link) => {
                            const ev = evidenceById.get(link.evidenceId);
                            if (!ev) return null;
                            const paper = paperById.get(ev.paperId);
                            const linkKey = `${claim.id}:${link.evidenceId}`;
                            const linkNote = linkNoteDrafts[linkKey] ?? link.note;
                            return (
                              <div
                                key={link.evidenceId}
                                className={`receipt-row ${
                                  link.stance === "support"
                                    ? "border-l-[var(--green)]"
                                    : link.stance === "qualify"
                                      ? "border-l-[var(--yellow)]"
                                      : "border-l-[var(--red)]"
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="ticket ticket-violet !py-0.5 shrink-0">{ev.field}</span>
                                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)] truncate">
                                      {ev.documentId ? `PDF · p.${ev.page}` : "Abstract"}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-1.5 shrink-0">
                                    <StancePicker
                                      stance={link.stance}
                                      size="xs"
                                      onSelect={(s) => s !== link.stance && onSetStance(claim.id, link.evidenceId, s)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => onDetachEvidence(claim.id, link.evidenceId)}
                                      className="btn btn-ghost btn-chip !px-1.5"
                                      title="Detach this receipt from the claim"
                                      aria-label="Detach receipt"
                                    >
                                      <Unlink className="w-3.5 h-3.5" />
                                    </button>
                                  </span>
                                </div>
                                <p className="text-[13px] leading-relaxed text-[var(--ink-body)] mt-1.5">
                                  “{ev.statement.length > 220 ? ev.statement.slice(0, 220) + "…" : ev.statement}”
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                  {paper && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenPaper(paper)}
                                      className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--cyan-ink)] hover:underline truncate max-w-full"
                                      title={paper.title}
                                    >
                                      {paper.title.length > 56 ? paper.title.slice(0, 56) + "…" : paper.title}
                                    </button>
                                  )}
                                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                                    {ev.kind === "researcher note" ? "researcher note" : "verbatim passage"}
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  value={linkNote}
                                  onChange={(e) =>
                                    setLinkNoteDrafts((prev) => ({ ...prev, [linkKey]: e.target.value }))
                                  }
                                  onBlur={(e) => {
                                    if (e.target.value !== link.note)
                                      onSetLinkNote(claim.id, link.evidenceId, e.target.value);
                                    setLinkNoteDrafts((prev) => {
                                      const { [linkKey]: _drop, ...rest } = prev;
                                      return e.target.value === link.note ? rest : prev;
                                    });
                                  }
                                  }
                                  placeholder="Optional note — how exactly does this receipt bear on the claim?…"
                                  className="field-input w-full !py-1.5 !text-[12px] !border !border-[var(--border-soft)] mt-1"
                                  aria-label="Note on this attachment"
                                />
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Claim notes (collapsible, only when non-empty or focused) */}
                      {(claim.notes.trim() || noteDrafts[claim.id] !== undefined) && (
                        <div className="mt-3">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [claim.id]: e.target.value }))
                            }
                            onBlur={(e) => {
                              if (e.target.value !== claim.notes)
                                onUpdateClaimNotes(claim.id, e.target.value);
                              setNoteDrafts((prev) => {
                                const { [claim.id]: _drop, ...rest } = prev;
                                return e.target.value === claim.notes ? rest : prev;
                              });
                            }
                            }
                            placeholder="Claim notes…"
                            className="field-input w-full !py-1.5 !text-[12px] !border !border-[var(--border-soft)]"
                            aria-label={`Notes for claim ${index + 1}`}
                          />
                        </div>
                      )}
                      <div className="mt-2 flex justify-between items-center">
                        <span className="font-mono text-[8.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                          created {new Date(claim.createdAt).toLocaleDateString()} · {claim.evidence.length} {claim.evidence.length === 1 ? "receipt" : "receipts"}
                        </span>
                        {!claim.notes.trim() && noteDrafts[claim.id] === undefined && (
                          <button
                            type="button"
                            onClick={() => setNoteDrafts((prev) => ({ ...prev, [claim.id]: "" }))}
                            className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[var(--cyan-ink)] hover:underline"
                          >
                            + add claim note
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* ============== RIGHT: EVIDENCE POOL ============== */}
        <aside className="xl:col-span-5 xl:sticky xl:top-6 space-y-3">
          <section className="bench-card p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <FileText className="w-4 h-4 text-[var(--violet-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Evidence pool</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
              <span className="ticket ticket-violet !py-0.5">{evidence.length} total</span>
            </div>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)] leading-relaxed">
              {selectedClaim
                ? `Attaching to claim C${String(claims.indexOf(selectedClaim) + 1).padStart(2, "0")} — receipts land with stance “support”; change it on the claim card.`
                : "Select a claim first — then every attach button below targets it."}
            </p>
            <input
              type="search"
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
              placeholder="Filter receipts by text, field, or paper…"
              className="field-input w-full"
              aria-label="Filter the evidence pool"
            />
            <div className="pool-list max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {filteredPool.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)] py-4 text-center">
                  No receipts match “{poolFilter}”.
                </p>
              ) : (
                filteredPool.map((ev) => {
                  const paper = paperById.get(ev.paperId);
                  const attachedTo = attachmentsByEvidence.get(ev.id) ?? [];
                  const attachedToSelected =
                    selectedClaim?.evidence.some((l) => l.evidenceId === ev.id) ?? false;
                  return (
                    <div key={ev.id} className="pool-row">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="ticket ticket-violet !py-0">{ev.field}</span>
                            <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                              {ev.documentId ? `PDF · p.${ev.page}` : "Abstract"}
                            </span>
                            {attachedTo.length > 0 && (
                              <span className="ticket ticket-solid-cyan !py-0" title={`Backs ${attachedTo.length} ${attachedTo.length === 1 ? "claim" : "claims"}`}>
                                {attachedTo.map((a) => `C${a.index}`).join("·")}
                              </span>
                            )}
                          </div>
                          <p className="text-[12.5px] leading-relaxed text-[var(--ink-body)] mt-1.5">
                            “{ev.statement.length > 140 ? ev.statement.slice(0, 140) + "…" : ev.statement}”
                          </p>
                          {paper && (
                            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)] mt-1 truncate" title={paper.title}>
                              {paper.title.length > 60 ? paper.title.slice(0, 60) + "…" : paper.title}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!selectedClaim || attachedToSelected}
                          onClick={() => selectedClaim && onAttachEvidence(selectedClaim.id, ev.id, "support")}
                          className={`btn btn-chip !px-2 shrink-0 text-[9.5px] font-mono font-bold uppercase tracking-wider ${
                            attachedToSelected
                              ? "btn-ghost opacity-50 cursor-not-allowed"
                              : selectedClaim
                                ? "btn-accent-magenta"
                                : "btn-ghost opacity-60 cursor-not-allowed"
                          }`}
                          title={
                            attachedToSelected
                              ? "Already attached to the selected claim"
                              : selectedClaim
                                ? "Attach to the selected claim"
                                : "Select a claim on the left first"
                          }
                        >
                          <Link2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                          <span>{attachedToSelected ? "On claim" : "Attach"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Outline export */}
          <section className="bench-card p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <FileDown className="w-4 h-4 text-[var(--green-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Outline & export</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowOutline(!showOutline)}
                className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                aria-expanded={showOutline}
              >
                <span>{showOutline ? "Hide" : "Preview"} outline</span>
              </button>
              <button
                type="button"
                onClick={handleCopyOutline}
                className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                title="Copy the full Markdown outline"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span>Copy .md</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadOutline}
                className="btn btn-accent-green btn-chip text-[10px] font-mono uppercase tracking-wider"
                title="Download the outline as a Markdown file"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
            {showOutline && (
              <pre className="outline-preview font-mono text-[11px] leading-relaxed whitespace-pre-wrap" tabIndex={0} aria-label="Markdown outline preview">
                {outline.length > 4000 ? outline.slice(0, 4000) + "\n\n… (truncated preview — download for the full outline)" : outline}
              </pre>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
