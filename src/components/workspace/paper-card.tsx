"use client";

import { useState } from "react";
import {
  FileText,
  Bookmark,
  Scale,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import type { Repro, Workspace } from "@/lib/workspace/schema";
import { resolvePaperAccess } from "./source-resolver";

export type Paper = Workspace["papers"][number];
export type { Evidence } from "@/lib/workspace/schema";

interface PaperCardProps {
  paper: Paper;
  isSaved: boolean;
  isCompared: boolean;
  onToggleSave: (paper: Paper) => void;
  onToggleCompare: (paper: Paper) => void;
  onOpenReader: (paper: Paper) => void;
  onAddToProject?: (paper: Paper) => void;
  repro?: Repro | undefined;
}

export function PaperCard({
  paper,
  isSaved,
  isCompared,
  onToggleSave,
  onToggleCompare,
  onOpenReader,
  onAddToProject,
  repro,
}: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const access = resolvePaperAccess(paper);

  const authorsDisplay =
    paper.authors.length > 0
      ? paper.authors.slice(0, 4).join(", ") +
        (paper.authors.length > 4 ? ` et al. (+${paper.authors.length - 4})` : "")
      : "Unknown authors";

  const hasIntegrityWarning =
    paper.integrityNotices && paper.integrityNotices.length > 0;

  // Repro summary: N/3 rerunnable + per-item detail in the tooltip
  const reproChecks = repro ? [repro.code, repro.data, repro.seeds] : [];
  const reproYes = reproChecks.filter((v) => v === true).length;
  const reproNo = reproChecks.filter((v) => v === false).length;
  const reproSet = reproYes + reproNo > 0 || !!repro?.license;

  return (
    <article
      className={`paper-slip space-y-3.5 ${isSaved ? "is-saved" : ""}`}
    >
      {/* Top metadata strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {paper.year && (
            <span
              className="font-mono text-[11px] font-bold px-2 py-[3px] border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper-dim)] text-[var(--ink-heading)]"
              title="Publication year"
            >
              {paper.year}
            </span>
          )}
          {paper.venue && (
            <span
              className="max-w-[280px] truncate ticket"
              style={{ textTransform: "none", letterSpacing: "0.02em" }}
              title={paper.venue}
            >
              {paper.venue}
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
          {hasIntegrityWarning && (
            <span className="ticket ticket-red" title="Paper retracted or flagged">
              <AlertTriangle className="w-3 h-3" />
              <span>Flagged</span>
            </span>
          )}
          {reproSet && (
            <span
              className={`ticket ${reproNo > 0 ? (reproYes > 0 ? "ticket-orange" : "ticket-red") : "ticket-green"}`}
              title={`Reproducibility: code ${repro?.code === true ? "✓" : repro?.code === false ? "✗" : "?"} · data ${repro?.data === true ? "✓" : repro?.data === false ? "✗" : "?"} · seeds/hyperparams ${repro?.seeds === true ? "✓" : repro?.seeds === false ? "✗" : "?"}${repro?.license ? ` · license ${repro.license}` : ""}`}
            >
              <span>Repro {reproYes}/3</span>
            </span>
          )}
        </div>

        {/* Quick toggles */}
        <div className="flex items-center gap-1.5">
          {onAddToProject && (
            <button
              type="button"
              onClick={() => onAddToProject(paper)}
              className="btn btn-ghost btn-chip !px-2 hover:!border-[var(--magenta)] hover:!text-[var(--magenta-ink)]"
              title="Add to screening project"
              aria-label="Add to project"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleCompare(paper)}
            className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
              isCompared ? "btn-accent-orange !shadow-none" : "btn-ghost"
            }`}
            title="Compare side-by-side"
            aria-pressed={isCompared}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>{isCompared ? "Comparing" : "Compare"}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleSave(paper)}
            className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
              isSaved ? "btn-accent-yellow !shadow-none" : "btn-ghost"
            }`}
            title={isSaved ? "Remove from library" : "Save to library"}
            aria-pressed={isSaved}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`} />
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>
        </div>
      </div>

      {/* Title */}
      <h3
        onClick={() => onOpenReader(paper)}
        className="text-lg sm:text-xl font-bold leading-snug cursor-pointer hover:underline decoration-[var(--cyan)] decoration-2 underline-offset-4 transition-colors"
      >
        {paper.title}
      </h3>

      {/* Authors */}
      <p className="text-sm text-[var(--ink-body)] italic">
        {authorsDisplay}
      </p>

      {/* Abstract */}
      {paper.abstract && (
        <div className="pt-0.5">
          <p
            className={`text-[13.5px] sm:text-sm text-[var(--ink-body)] leading-relaxed ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {paper.abstract}
          </p>
          {paper.abstract.length > 280 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--cyan-ink)] hover:underline"
            >
              <span>{expanded ? "Collapse" : "Expand abstract"}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t-2 border-dotted border-[var(--border-soft)]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenReader(paper)}
            className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Open reader</span>
          </button>
          {access.primaryAction && (
            <a
              href={access.primaryAction.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                access.hasDirectPdf ? "btn-accent-green" : "btn-ghost"
              }`}
            >
              {access.hasDirectPdf && <FileText className="w-3.5 h-3.5" />}
              <span>{access.primaryAction.label}</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          )}
        </div>
        {paper.doi && (
          <span className="font-mono text-[11px] text-[var(--ink-muted)] truncate max-w-[260px]">
            DOI: {paper.doi}
          </span>
        )}
      </div>
    </article>
  );
}
