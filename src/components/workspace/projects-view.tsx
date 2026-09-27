"use client";

import { useState } from "react";
import {
  FolderGit2,
  Plus,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpen,
  ScrollText,
  Table2,
  Layers,
  FileText,
  ArrowRight,
  CircleSlash,
  Workflow,
  FlaskConical,
  Users,
} from "lucide-react";
import type { Project, Evidence, Repro, Workspace } from "@/lib/workspace/schema";
import { fields } from "@/lib/workspace/schema";
import type { Paper } from "./paper-card";
import { resolvePaperAccess } from "./source-resolver";
import { PrismaDialog } from "./prisma-dialog";
import { SeminarPanel } from "./seminar-panel";
import type { SeminarBundle } from "@/lib/workspace/seminar";

interface ProjectsViewProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, question: string, criteria: string) => void;
  onUpdateMemberDecision: (
    projectId: string,
    paperId: string,
    decision: "include" | "exclude" | "maybe" | "unscreened",
    reason: string
  ) => void;
  onUpdateMemberRepro: (
    projectId: string,
    paperId: string,
    repro: Repro | undefined
  ) => void;
  /** Seminar mode: download the exporter's bundle file. */
  onExportBundle: (bundle: SeminarBundle) => void;
  /** Seminar mode: build the blind project from a peer's bundle. */
  onImportBlind: (bundle: SeminarBundle) => Promise<boolean>;
  allPapers: Paper[];
  evidenceList: Evidence[];
  searches: Workspace["searches"];
  onOpenReader: (paper: Paper) => void;
}

type Decision = "unscreened" | "include" | "exclude" | "maybe";

/** Tri-state repro toggle: unseen → yes → no → unseen. */
function ReproToggle({
  label,
  value,
  onCycle,
}: {
  label: string;
  value: boolean | null;
  onCycle: () => void;
}) {
  const state = value === true ? "yes" : value === false ? "no" : "unknown";
  return (
    <button
      type="button"
      onClick={onCycle}
      className={`btn btn-chip !px-2 !py-1 text-[9.5px] font-mono font-bold uppercase tracking-wider ${
        state === "yes"
          ? "btn-accent-green !shadow-none"
          : state === "no"
            ? "btn-accent-red !shadow-none"
            : "btn-ghost"
      }`}
      aria-pressed={state !== "unknown"}
      aria-label={`${label}: ${state === "yes" ? "present" : state === "no" ? "absent" : "not checked yet"} — click to change`}
      title={
        state === "yes"
          ? `${label}: present — click to mark absent`
          : state === "no"
            ? `${label}: absent — click to clear`
            : `${label}: not checked — click to mark present`
      }
    >
      {state === "yes" ? "✓" : state === "no" ? "✗" : "?"} {label}
    </button>
  );
}

/** The "can I rerun this?" checklist for one screened paper. */
function ReproChecklist({
  member,
  onSet,
}: {
  member: Project["members"][number];
  onSet: (repro: Repro | undefined) => void;
}) {
  const repro: Repro = member.repro ?? {
    code: null,
    data: null,
    seeds: null,
    license: null,
  };
  const hasAny =
    repro.code !== null || repro.data !== null || repro.seeds !== null || !!repro.license;
  const cycle = (key: "code" | "data" | "seeds") => {
    const current = repro[key];
    const next = current === null ? true : current === true ? false : null;
    const patch = { ...repro, [key]: next };
    // All-null + no license → treat as unset again
    const isEmpty =
      patch.code === null && patch.data === null && patch.seeds === null && !patch.license;
    onSet(isEmpty ? undefined : patch);
  };
  return (
    <div className="pt-2.5 border-t-2 border-dotted border-[var(--border-soft)] flex flex-wrap items-center gap-2">
      <FlaskConical className="w-3.5 h-3.5 text-[var(--green-ink)]" strokeWidth={2.2} />
      <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)] mr-1">
        Repro:
      </span>
      <ReproToggle label="Code" value={repro.code} onCycle={() => cycle("code")} />
      <ReproToggle label="Data" value={repro.data} onCycle={() => cycle("data")} />
      <ReproToggle label="Seeds" value={repro.seeds} onCycle={() => cycle("seeds")} />
      <input
        type="text"
        defaultValue={repro.license ?? ""}
        placeholder="License… e.g. MIT"
        maxLength={100}
        onBlur={(e) => {
          const value = e.target.value.trim() || null;
          if (value === (member.repro?.license ?? null)) return;
          const patch = { ...repro, license: value };
          const isEmpty =
            patch.code === null && patch.data === null && patch.seeds === null && !patch.license;
          onSet(isEmpty ? undefined : patch);
        }}
        className="field-input !w-[150px] !py-1 !text-[11px] !border !border-[var(--border-soft)]"
        aria-label="License stated by the paper"
        title="License stated by the paper (empty = not stated)"
      />
      {hasAny && (
        <button
          type="button"
          onClick={() => onSet(undefined)}
          className="btn btn-ghost btn-chip !px-1.5"
          title="Clear the reproducibility checklist"
          aria-label="Clear reproducibility checklist"
        >
          <CircleSlash className="w-3 h-3" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

export function ProjectsView({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateMemberDecision,
  onUpdateMemberRepro,
  onExportBundle,
  onImportBlind,
  allPapers,
  evidenceList,
  searches,
  onOpenReader,
}: ProjectsViewProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newCriteria, setNewCriteria] = useState("");
  const [activeTab, setActiveTab] = useState<"screening" | "matrix" | "seminar">("screening");
  const [showPrisma, setShowPrisma] = useState(false);
  // Per-paper reason drafts (paperId -> reason text)
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  const currentProject =
    projects.find((p) => p.id === activeProjectId) || projects[0] || null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateProject(newName.trim(), newQuestion.trim(), newCriteria.trim());
    setNewName("");
    setNewQuestion("");
    setNewCriteria("");
    setIsCreating(false);
  };

  const papersMap = new Map(allPapers.map((p) => [p.id, p]));

  const members = currentProject?.members ?? [];
  const counts = {
    total: members.length,
    include: members.filter((m) => m.decision === "include").length,
    exclude: members.filter((m) => m.decision === "exclude").length,
    maybe: members.filter((m) => m.decision === "maybe").length,
    unscreened: members.filter((m) => m.decision === "unscreened").length,
  };

  const setDecision = (paperId: string, decision: Decision) => {
    if (!currentProject) return;
    const member = members.find((m) => m.paperId === paperId);
    const reason = reasonDrafts[paperId] ?? member?.reason ?? "";
    onUpdateMemberDecision(currentProject.id, paperId, decision, reason);
  };

  const commitReason = (paperId: string, reason: string) => {
    if (!currentProject) return;
    const member = members.find((m) => m.paperId === paperId);
    if (!member || member.decision === "unscreened") return;
    onUpdateMemberDecision(currentProject.id, paperId, member.decision, reason);
  };

  return (
    <div className="space-y-8">
      {/* ===== MASTHEAD ===== */}
      <div className="space-y-3 animate-rise">
        <div className="flex items-center gap-3">
          <span className="stamp-label">
            <span className="stamp-num">04</span> / Projects
          </span>
          <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
          <span className="ticket ticket-magenta">
            <span>{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold font-display leading-[1.05]">
          Screening &amp; <span className="text-[var(--magenta-ink)]">synthesis.</span>
        </h1>
        <p className="text-[var(--ink-body)] text-base max-w-2xl leading-relaxed">
          Define a research question and an inclusion protocol, then triage the evidence
          paper by paper. Every decision and its reason is recorded as a defensible
          audit trail.
        </p>
      </div>

      {/* ===== PROJECT SELECTOR + NEW BUTTON ===== */}
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 animate-rise">
          {projects.map((proj) => {
            const active = currentProject?.id === proj.id;
            const projIn = proj.members.filter((m) => m.decision === "include").length;
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => onSelectProject(proj.id)}
                className={`btn btn-chip font-mono ${
                  active ? "btn-ink" : "btn-ghost"
                }`}
                aria-pressed={active}
              >
                <span className="text-[12px] font-bold">{proj.name}</span>
                <span className={`text-[9.5px] uppercase tracking-wider ${active ? "opacity-80" : "text-[var(--ink-muted)]"}`}>
                  {proj.members.length} papers · {projIn} in
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsCreating((v) => !v)}
            className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider ml-1"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
            <span>{isCreating ? "Close" : "New project"}</span>
          </button>
        </div>
      )}

      {/* ===== CREATE PROJECT FORM ===== */}
      {isCreating && (
        <form onSubmit={handleCreate} className="bench-card p-6 sm:p-7 space-y-5 animate-rise">
          <div className="flex items-center gap-2.5">
            <span className="ticket ticket-magenta">
              <span>Initialize</span>
            </span>
            <h3 className="stamp-label">
              <span className="stamp-underline">Configure systematic review</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <label className="flex flex-col gap-1.5 md:col-span-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Project title
              </span>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Temporal Graph Networks for Dynamic Reasoning"
                className="field-input h-11"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Primary research question
              </span>
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Which architectures minimize hallucination under temporal shift?"
                className="field-input h-11"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Inclusion / exclusion criteria
              </span>
              <input
                type="text"
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder="Empirical 2021–2026, benchmark precision reported…"
                className="field-input h-11"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              Initialize project
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
            </button>
          </div>
        </form>
      )}

      {/* ===== ACTIVE PROJECT CONTENT ===== */}
      {currentProject ? (
        <div className="space-y-6 animate-rise">
          {/* Project brief + KPIs + tabs */}
          <div className="bench-card p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2.5 min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-extrabold font-display leading-tight">
                  {currentProject.name}
                </h2>
                {currentProject.question && (
                  <div className="flex flex-col gap-1 max-w-2xl">
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--magenta-ink)]">
                      Research question
                    </span>
                    <p className="text-sm text-[var(--ink-body)] leading-relaxed italic border-l-4 border-[var(--magenta)] pl-3">
                      {currentProject.question}
                    </p>
                  </div>
                )}
                {currentProject.criteria && (
                  <div className="flex flex-col gap-1 max-w-2xl">
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                      Protocol criteria
                    </span>
                    <p className="text-[13px] text-[var(--ink-body)] leading-relaxed">
                      {currentProject.criteria}
                    </p>
                  </div>
                )}
              </div>
              <span className="ticket shrink-0">
                <span>
                  Created{" "}
                  {new Date(currentProject.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setShowPrisma(true)}
                className="btn btn-accent-cyan btn-chip text-[10.5px] font-mono uppercase tracking-wider shrink-0"
                title="Generate a PRISMA-style flow diagram from this project's real screening counts"
              >
                <Workflow className="w-3.5 h-3.5" strokeWidth={2.2} />
                <span>PRISMA diagram</span>
              </button>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="stat-cell">
                <span className="stat-label">Total</span>
                <span className="stat-value">{counts.total}</span>
                <span className="stat-sub">papers queued</span>
              </div>
              <div className="stat-cell tone-green">
                <span className="stat-label">Include</span>
                <span className="stat-value text-[var(--green-ink)]">{counts.include}</span>
                <span className="stat-sub">accepted</span>
              </div>
              <div className="stat-cell tone-magenta">
                <span className="stat-label">Maybe</span>
                <span className="stat-value text-[var(--magenta-ink)]">{counts.maybe}</span>
                <span className="stat-sub">undecided</span>
              </div>
              <div className="stat-cell tone-red">
                <span className="stat-label">Exclude</span>
                <span className="stat-value text-[var(--red-ink)]">{counts.exclude}</span>
                <span className="stat-sub">rejected</span>
              </div>
            </div>

            {/* Tab toggle */}
            <div className="mt-2 flex items-center gap-1.5 border-b-2 border-[var(--border-ink)]">
              <button
                type="button"
                onClick={() => setActiveTab("screening")}
                className={`relative -mb-0.5 py-2.5 px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border-b-4 ${
                  activeTab === "screening"
                    ? "border-[var(--cyan)] text-[var(--cyan-ink)]"
                    : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-heading)]"
                }`}
                aria-pressed={activeTab === "screening"}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ScrollText className="w-3.5 h-3.5" strokeWidth={2.2} />
                  Screening queue ({counts.total})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("matrix")}
                className={`relative -mb-0.5 py-2.5 px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border-b-4 ${
                  activeTab === "matrix"
                    ? "border-[var(--cyan)] text-[var(--cyan-ink)]"
                    : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-heading)]"
                }`}
                aria-pressed={activeTab === "matrix"}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Table2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                  Evidence matrix
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("seminar")}
                className={`relative -mb-0.5 py-2.5 px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border-b-4 ${
                  activeTab === "seminar"
                    ? "border-[var(--orange)] text-[var(--orange-ink)]"
                    : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-heading)]"
                }`}
                aria-pressed={activeTab === "seminar"}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" strokeWidth={2.2} />
                  Seminar · peer κ
                </span>
              </button>
            </div>
          </div>

          {/* ===== SCREENING TAB ===== */}
          {activeTab === "screening" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <h3 className="stamp-label">
                  <span className="stamp-underline">Screening queue</span>
                </h3>
                <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
                <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                  {counts.unscreened} unscreened
                </span>
              </div>

              {members.length === 0 ? (
                <div className="bench-card p-12 text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--magenta-wash)] text-[var(--magenta-ink)] hatch">
                    <Layers className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-extrabold font-display">
                      No papers catalogued yet
                    </h4>
                    <p className="text-[13px] text-[var(--ink-body)] leading-relaxed max-w-md mx-auto">
                      Use the{" "}
                      <span className="font-mono font-bold text-[var(--magenta-ink)]">
                        Add to project
                      </span>{" "}
                      control on any paper card in Discover or Saved to queue it here
                      for screening.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bench-scroll space-y-3 max-h-96 overflow-y-auto pr-1">
                  {members.map((member) => {
                    const paper = papersMap.get(member.paperId);
                    if (!paper) return null;
                    const access = resolvePaperAccess(paper);
                    const decision = member.decision as Decision;

                    const authorsDisplay =
                      paper.authors.length > 0
                        ? paper.authors.slice(0, 3).join(", ") +
                          (paper.authors.length > 3
                            ? ` et al. (+${paper.authors.length - 3})`
                            : "")
                        : "Unknown authors";

                    return (
                      <article key={member.paperId} className="paper-slip space-y-3">
                        {/* Metadata strip */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {paper.year && (
                              <span className="font-mono text-[11px] font-bold px-2 py-[3px] border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper-dim)] text-[var(--ink-heading)]">
                                {paper.year}
                              </span>
                            )}
                            {paper.citationCount !== null && (
                              <span className="ticket ticket-violet">
                                <span>{paper.citationCount} {paper.citationCount === 1 ? "cite" : "cites"}</span>
                              </span>
                            )}
                            <span
                              className={`ticket ${access.accessBadge.variant === "emerald" ? "ticket-green" : "ticket-cyan"}`}
                              title={access.accessBadge.tooltip}
                            >
                              <span>{access.accessBadge.label}</span>
                            </span>
                            <span
                              className={`ticket ${
                                decision === "include"
                                  ? "ticket-green"
                                  : decision === "exclude"
                                    ? "ticket-red"
                                    : decision === "maybe"
                                      ? "ticket-magenta"
                                      : ""
                              }`}
                            >
                              <span>{decision}</span>
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenReader(paper)}
                            className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                          >
                            <BookOpen className="w-3.5 h-3.5" strokeWidth={2.2} />
                            Reader
                          </button>
                        </div>

                        {/* Title */}
                        <h3
                          onClick={() => onOpenReader(paper)}
                          className="text-base sm:text-lg font-bold font-display leading-snug cursor-pointer hover:underline decoration-[var(--cyan)] decoration-2 underline-offset-4 transition-colors"
                        >
                          {paper.title}
                        </h3>

                        {/* Authors */}
                        <p className="text-[13px] text-[var(--ink-body)] italic">
                          {authorsDisplay}
                        </p>

                        {/* Decision controls + reason input */}
                        <div className="pt-3 border-t-2 border-dotted border-[var(--border-soft)] flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)] mr-1">
                            Triage:
                          </span>

                          <button
                            type="button"
                            onClick={() => setDecision(member.paperId, "include")}
                            className={`btn btn-chip text-[10.5px] font-mono uppercase tracking-wider ${
                              decision === "include" ? "btn-accent-green !shadow-none" : "btn-ghost"
                            }`}
                            aria-pressed={decision === "include"}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                            Include
                          </button>

                          <button
                            type="button"
                            onClick={() => setDecision(member.paperId, "exclude")}
                            className={`btn btn-chip text-[10.5px] font-mono uppercase tracking-wider ${
                              decision === "exclude" ? "btn-accent-red !shadow-none" : "btn-ghost"
                            }`}
                            aria-pressed={decision === "exclude"}
                          >
                            <XCircle className="w-3.5 h-3.5" strokeWidth={2.2} />
                            Exclude
                          </button>

                          <button
                            type="button"
                            onClick={() => setDecision(member.paperId, "maybe")}
                            className={`btn btn-chip text-[10.5px] font-mono uppercase tracking-wider ${
                              decision === "maybe" ? "btn-accent-magenta !shadow-none" : "btn-ghost"
                            }`}
                            aria-pressed={decision === "maybe"}
                          >
                            <HelpCircle className="w-3.5 h-3.5" strokeWidth={2.2} />
                            Maybe
                          </button>

                          {decision !== "unscreened" && (
                            <button
                              type="button"
                              onClick={() => setDecision(member.paperId, "unscreened")}
                              className="btn btn-ghost btn-chip !px-2 text-[10.5px] font-mono uppercase tracking-wider"
                              title="Clear decision"
                            >
                              <CircleSlash className="w-3.5 h-3.5" strokeWidth={2.2} />
                            </button>
                          )}

                          {/* Reason input */}
                          <input
                            type="text"
                            value={
                              reasonDrafts[member.paperId] ??
                              member.reason ??
                              ""
                            }
                            onChange={(e) =>
                              setReasonDrafts((prev) => ({
                                ...prev,
                                [member.paperId]: e.target.value,
                              }))
                            }
                            onBlur={(e) =>
                              commitReason(member.paperId, e.target.value)
                            }
                            placeholder={
                              decision === "unscreened"
                                ? "Optional reason — set after triage…"
                                : "Reason for decision…"
                            }
                            className="field-input flex-1 min-w-[200px] !py-1.5 !text-[12px]"
                          />
                        </div>

                        {/* Reproducibility checklist — "can I rerun this?" */}
                        <ReproChecklist
                          member={member}
                          onSet={(repro) => {
                            if (!currentProject) return;
                            onUpdateMemberRepro(
                              currentProject.id,
                              member.paperId,
                              repro
                            );
                          }}
                        />
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== MATRIX TAB ===== */}
          {activeTab === "matrix" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <h3 className="stamp-label">
                  <span className="stamp-underline">Evidence matrix</span>
                </h3>
                <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
                <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                  {evidenceList.filter((e) =>
                    members.some((m) => m.paperId === e.paperId)
                  ).length}{" "}
                  evidence items
                </span>
              </div>

              {members.length === 0 ? (
                <div className="bench-card p-10 text-center space-y-2">
                  <Layers className="h-6 w-6 mx-auto text-[var(--ink-muted)]" strokeWidth={2} />
                  <p className="text-sm text-[var(--ink-muted)] font-mono uppercase tracking-wider">
                    No papers in matrix yet.
                  </p>
                </div>
              ) : (
                <div className="bench-card p-0 overflow-x-auto">
                  <table className="bench-table min-w-[820px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-[var(--bg-paper-dim)] z-10 min-w-[240px] text-left">
                          Paper
                        </th>
                        <th>Decision</th>
                        {fields.map((f) => (
                          <th key={f} className="text-center whitespace-nowrap">
                            {f}
                          </th>
                        ))}
                        <th className="text-center">Σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => {
                        const paper = papersMap.get(member.paperId);
                        if (!paper) return null;
                        const paperEv = evidenceList.filter(
                          (e) => e.paperId === member.paperId
                        );
                        return (
                          <tr key={member.paperId}>
                            <td className="sticky left-0 bg-[var(--bg-paper)] z-10 max-w-[280px]">
                              <button
                                type="button"
                                onClick={() => onOpenReader(paper)}
                                className="text-left group block"
                              >
                                <span className="block font-bold font-display line-clamp-1 group-hover:text-[var(--cyan-ink)] transition-colors">
                                  {paper.title}
                                </span>
                                <span className="font-mono text-[10px] text-[var(--ink-muted)] mt-0.5 block">
                                  {paper.year || "—"} ·{" "}
                                  {paper.authors[0] || "Unknown"}
                                  {paper.authors.length > 1 ? " et al." : ""}
                                </span>
                              </button>
                            </td>
                            <td>
                              <span
                                className={`ticket ${
                                  member.decision === "include"
                                    ? "ticket-green"
                                    : member.decision === "exclude"
                                      ? "ticket-red"
                                      : member.decision === "maybe"
                                        ? "ticket-magenta"
                                        : ""
                                }`}
                              >
                                <span>{member.decision}</span>
                              </span>
                            </td>
                            {fields.map((f) => {
                              const cellEv = paperEv.filter((e) => e.field === f);
                              const count = cellEv.length;
                              return (
                                <td
                                  key={f}
                                  className="text-center align-middle min-w-[70px]"
                                >
                                  {count > 0 ? (
                                    <span
                                      title={cellEv
                                        .map((e) => e.statement)
                                        .join("\n\n")}
                                      className="inline-flex items-center justify-center min-w-[26px] h-7 px-1.5 border-2 border-[var(--green)] bg-[var(--green-wash)] text-[var(--green-ink)] font-mono text-[11px] font-bold cursor-help rounded-[var(--radius-cut)]"
                                    >
                                      {count}
                                    </span>
                                  ) : (
                                    <span className="inline-block w-7 h-7 hatch rounded-[var(--radius-cut)] border border-[var(--border-soft)]" title="No evidence captured for this field" />
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center font-mono font-bold text-[var(--cyan-ink)] text-base">
                              {paperEv.length}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="flex items-start gap-2 font-mono text-[10px] text-[var(--ink-muted)] leading-relaxed uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5 text-[var(--cyan-ink)] shrink-0 mt-0.5" strokeWidth={2.2} />
                Cells show the count of evidence items captured for each paper across
                the standardized fields — hatched cells are visibly missing evidence.
                Hover a number to preview the underlying statements. Open the reader
                to author new evidence.
              </p>
            </div>
          )}

          {/* ===== SEMINAR TAB (peer screening + Cohen's κ) ===== */}
          {activeTab === "seminar" && (
            <SeminarPanel
              project={currentProject}
              workspace={{ papers: allPapers }}
              onExportBundle={onExportBundle}
              onImportBlind={onImportBlind}
            />
          )}
        </div>
      ) : (
        /* ===== EMPTY STATE — NO PROJECTS ===== */
        <div className="bench-card p-12 text-center max-w-xl mx-auto space-y-4 animate-rise">
          <div className="mx-auto flex h-14 w-14 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--magenta-wash)] text-[var(--magenta-ink)] hatch">
            <FolderGit2 className="h-7 w-7" strokeWidth={2} />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl font-extrabold font-display">
              No screening projects yet
            </h3>
            <p className="text-sm text-[var(--ink-body)] leading-relaxed">
              Define a research question and an inclusion protocol, then queue candidate
              papers for systematic triage. Every decision and its reason is logged as
              a defensible audit trail.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" strokeWidth={2.6} />
            New project
          </button>
        </div>
      )}

      {/* ===== PRISMA DIALOG ===== */}
      {currentProject && (
        <PrismaDialog
          open={showPrisma}
          onOpenChange={setShowPrisma}
          searches={searches}
          project={currentProject}
        />
      )}
    </div>
  );
}
