"use client";

import type { ReactNode } from "react";
import {
  Scale,
  X,
  ExternalLink,
  BookOpen,
  Trash2,
  Compass,
  ArrowRight,
  FileText,
} from "lucide-react";
import type { Evidence, Repro } from "@/lib/workspace/schema";
import { fields } from "@/lib/workspace/schema";
import type { Paper } from "./paper-card";
import { resolvePaperAccess } from "./source-resolver";

interface CompareViewProps {
  comparedPapers: Paper[];
  onRemovePaper: (paperId: string) => void;
  onClearAll: () => void;
  onOpenReader: (paper: Paper) => void;
  onNavigateToDiscover: () => void;
  evidenceList: Evidence[];
  reproByPaperId?: Record<string, Repro | undefined>;
}

/**
 * KIVO Compare — the weigh station. Up to eight records side-by-side across
 * attributes and captured evidence fields. Orange is the compare accent.
 */
export function CompareView({
  comparedPapers,
  onRemovePaper,
  onClearAll,
  onOpenReader,
  onNavigateToDiscover,
  evidenceList,
  reproByPaperId,
}: CompareViewProps) {
  // ---------------------------------------------------------------- EMPTY
  if (comparedPapers.length === 0) {
    return (
      <div className="bench-card p-12 sm:p-16 text-center max-w-2xl mx-auto space-y-5 animate-rise">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--orange-wash)] text-[var(--orange-ink)] hatch">
          <Scale className="h-8 w-8" strokeWidth={2} />
        </div>
        <div className="space-y-2.5">
          <h3 className="text-2xl sm:text-3xl font-extrabold font-display leading-tight">
            The weigh station is <span className="text-[var(--orange-ink)]">empty.</span>
          </h3>
          <p className="text-sm sm:text-base text-[var(--ink-body)] leading-relaxed max-w-md mx-auto">
            Toggle &ldquo;Compare&rdquo; on any paper in Discover or your Library to
            weigh their methodologies, captured evidence, and citation impact
            side-by-side.
          </p>
        </div>
        <div className="pt-3">
          <button
            type="button"
            onClick={onNavigateToDiscover}
            className="btn btn-primary h-11 px-6 text-xs font-mono uppercase tracking-wider"
          >
            <Compass className="w-4 h-4" strokeWidth={2.4} />
            <span>Discover papers</span>
            <ArrowRight className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------- evidence per paper + field
  const evidenceByPaper = new Map<string, Map<string, number>>();
  for (const e of evidenceList) {
    if (!evidenceByPaper.has(e.paperId)) {
      evidenceByPaper.set(e.paperId, new Map());
    }
    const fieldMap = evidenceByPaper.get(e.paperId)!;
    fieldMap.set(e.field, (fieldMap.get(e.field) ?? 0) + 1);
  }

  const totalEvidenceFor = (paperId: string) => {
    const m = evidenceByPaper.get(paperId);
    if (!m) return 0;
    let sum = 0;
    for (const v of m.values()) sum += v;
    return sum;
  };

  // Repro labels exist for at least one compared column?
  const anyRepro = comparedPapers.some((p) => reproByPaperId?.[p.id]);

  return (
    <div className="space-y-7">
      {/* ============ SECTION MASTHEAD ============ */}
      <div className="space-y-4 animate-rise">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="stamp-label">
            <span className="stamp-num">05</span> / Compare
          </span>
          <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[40px]" />
          <span className="ticket ticket-orange">
            <span>{comparedPapers.length} {comparedPapers.length === 1 ? "paper" : "papers"} active</span>
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold font-display leading-[1.05]">
          Side-by-side <span className="text-[var(--orange-ink)]">differential.</span>
        </h1>
        <p className="text-[var(--ink-body)] text-base max-w-2xl leading-relaxed">
          Weigh methodologies, evidence, and citation impact across up to eight records.
          Each column is a paper; each row an attribute or evidence field captured in
          your workbench.
        </p>
      </div>

      {/* ============ TOOLBAR ============ */}
      <div className="flex items-center justify-between gap-3 flex-wrap animate-rise">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h3 className="stamp-label">
            <span className="stamp-underline">Matrix</span>
          </h3>
          <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
            {comparedPapers.length} of 8 cols · {fields.length} dimensions
          </span>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="btn btn-accent-red btn-chip text-[11px] font-mono uppercase tracking-wider"
          title="Remove every paper from the comparison"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
          <span>Clear all</span>
        </button>
      </div>

      {/* ============ COMPARISON MATRIX ============ */}
      <div className="bench-card p-0 overflow-hidden animate-rise">
        <div className="overflow-x-auto">
          <table className="bench-table min-w-[680px] !text-sm">
            <thead>
              <tr>
                <th className="w-44 align-bottom text-left !border-b-2">Attribute · Field</th>
                {comparedPapers.map((p, i) => {
                  const access = resolvePaperAccess(p);
                  return (
                    <th
                      key={p.id}
                      className="!border-b-2 !border-l-2 !border-l-[var(--border-soft)] min-w-[260px] max-w-[340px] align-top !bg-[var(--bg-paper)] !normal-case !tracking-normal !text-[10px] !p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                          COL {String(i + 1).padStart(2, "0")}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemovePaper(p.id)}
                          className="text-[var(--ink-muted)] hover:text-[var(--orange-ink)] transition-colors"
                          title="Remove from comparison"
                          aria-label={`Remove ${p.title} from comparison`}
                        >
                          <X className="w-4 h-4" strokeWidth={2.4} />
                        </button>
                      </div>
                      <h4
                        onClick={() => onOpenReader(p)}
                        className="mt-1.5 text-base sm:text-lg font-bold font-display leading-snug line-clamp-3 cursor-pointer hover:text-[var(--cyan-ink)] transition-colors text-left"
                        title={p.title}
                      >
                        {p.title}
                      </h4>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenReader(p)}
                          className="btn btn-primary btn-chip text-[10px] font-mono uppercase tracking-wider"
                        >
                          <BookOpen className="w-3 h-3" strokeWidth={2.4} />
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
                            {access.hasDirectPdf && <FileText className="w-3 h-3" strokeWidth={2.2} />}
                            <span>PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" strokeWidth={2.4} />
                          </a>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Authors */}
              <MatrixRow label="Authors">
                {comparedPapers.map((p) => (
                  <MatrixCell key={p.id}>
                    <p className="text-[13px] italic leading-snug">
                      {p.authors.length > 0
                        ? p.authors.slice(0, 3).join(", ") +
                          (p.authors.length > 3
                            ? ` +${p.authors.length - 3}`
                            : "")
                        : "Unknown authors"}
                    </p>
                  </MatrixCell>
                ))}
              </MatrixRow>

              {/* Year + Venue */}
              <MatrixRow label="Year · Venue">
                {comparedPapers.map((p) => (
                  <MatrixCell key={p.id}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.year ? (
                        <span className="font-mono text-[11px] font-bold px-2 py-[2px] border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper-dim)] text-[var(--ink-heading)]">
                          {p.year}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                          — year
                        </span>
                      )}
                      {p.venue && (
                        <span
                          className="font-mono text-[11px] truncate max-w-[180px]"
                          title={p.venue}
                        >
                          {p.venue}
                        </span>
                      )}
                    </div>
                  </MatrixCell>
                ))}
              </MatrixRow>

              {/* Citations */}
              <MatrixRow label="Citations">
                {comparedPapers.map((p) => (
                  <MatrixCell key={p.id}>
                    <span className="font-display text-xl font-extrabold text-[var(--violet-ink)]">
                      {p.citationCount !== null
                        ? p.citationCount.toLocaleString()
                        : "—"}
                    </span>
                    <span className="ml-1.5 font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider">
                      {p.citationCount === 1 ? "cite" : "cites"}
                    </span>
                  </MatrixCell>
                ))}
              </MatrixRow>

              {/* Access */}
              <MatrixRow label="Access">
                {comparedPapers.map((p) => {
                  const access = resolvePaperAccess(p);
                  return (
                    <MatrixCell key={p.id}>
                      <span
                        className={`ticket ${access.accessBadge.variant === "emerald" ? "ticket-green" : "ticket-cyan"}`}
                        title={access.accessBadge.tooltip}
                      >
                        <span>{access.accessBadge.label}</span>
                      </span>
                    </MatrixCell>
                  );
                })}
              </MatrixRow>

              {/* Reproducibility — only when a checklist was filled in Projects */}
              {anyRepro && (
                <MatrixRow label="Repro · code / data / seeds">
                  {comparedPapers.map((p) => {
                    const repro = reproByPaperId?.[p.id];
                    if (!repro) {
                      return (
                        <MatrixCell key={p.id}>
                          <span
                            className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]"
                            title="Not checked yet — fill the checklist in Projects"
                          >
                            — not checked
                          </span>
                        </MatrixCell>
                      );
                    }
                    const checks = [repro.code, repro.data, repro.seeds] as const;
                    const yes = checks.filter((v) => v === true).length;
                    const no = checks.filter((v) => v === false).length;
                    const cls =
                      yes > 0 && no === 0
                        ? "ticket-green"
                        : no > 0 && yes === 0
                          ? "ticket-red"
                          : "ticket-orange";
                    return (
                      <MatrixCell key={p.id}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`ticket ${cls}`}
                            title={`Code: ${repro.code === true ? "linked" : repro.code === false ? "absent" : "?"} · Data: ${repro.data === true ? "public" : repro.data === false ? "absent" : "?"} · Seeds/hyperparams: ${repro.seeds === true ? "stated" : repro.seeds === false ? "absent" : "?"}`}
                          >
                            <span>{yes}/{checks.length} rerunnable</span>
                          </span>
                          {checks.map((v, i) => (
                            <span
                              key={["code", "data", "seeds"][i]}
                              className={`font-mono text-[10px] font-bold ${
                                v === true
                                  ? "text-[var(--green-ink)]"
                                  : v === false
                                    ? "text-[var(--red-ink)]"
                                    : "text-[var(--ink-faint)]"
                              }`}
                              title={["Code", "Data", "Seeds/hyperparams"][i] + (v === true ? " ✓" : v === false ? " ✗" : " ?")}
                            >
                              {["C", "D", "S"][i]}
                              {v === true ? "✓" : v === false ? "✗" : "?"}
                            </span>
                          ))}
                          {repro.license && (
                            <span
                              className="ticket ticket-yellow"
                              title={`License: ${repro.license}`}
                            >
                              <span>{repro.license}</span>
                            </span>
                          )}
                        </div>
                      </MatrixCell>
                    );
                  })}
                </MatrixRow>
              )}

              {/* Divider row — evidence by field */}
              <tr>
                <td
                  colSpan={comparedPapers.length + 1}
                  className="!border-y-2 !border-y-[var(--border-ink)] bg-[var(--bg-paper-dim)] !py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="stamp-label">
                      <span className="stamp-underline">Evidence by field</span>
                    </span>
                    <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
                    <span className="font-mono text-[9.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                      {fields.length} dimensions
                    </span>
                  </div>
                </td>
              </tr>

              {/* Field rows */}
              {fields.map((field, idx) => (
                <tr key={field}>
                  <td className="!bg-[var(--bg-paper-dim)]/60 !border-r-2 !border-r-[var(--border-soft)]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--cyan-ink)]">
                        {field}
                      </span>
                    </div>
                  </td>
                  {comparedPapers.map((p) => {
                    const count =
                      evidenceByPaper.get(p.id)?.get(field) ?? 0;
                    return (
                      <td
                        key={p.id}
                        className="!border-l-2 !border-l-[var(--border-soft)]"
                      >
                        {count > 0 ? (
                          <span
                            className="inline-flex items-center gap-2 border-2 border-[var(--green)] bg-[var(--green-wash)] px-2 py-1 rounded-[var(--radius-cut)]"
                            title={`${count} evidence ${count === 1 ? "item" : "items"} for ${p.title} · ${field}`}
                          >
                            <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
                            <span className="font-mono text-sm font-bold text-[var(--green-ink)]">
                              {count}
                            </span>
                            <span className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider">
                              {count === 1 ? "note" : "notes"}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-block w-8 h-7 hatch rounded-[var(--radius-cut)] border border-[var(--border-soft)] align-middle" title="No evidence captured" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Total row */}
              <tr className="!border-t-2 !border-t-[var(--border-ink)] bg-[var(--bg-paper-dim)]/60">
                <td className="!border-r-2 !border-r-[var(--border-soft)]">
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--cyan-ink)]">
                    Total evidence
                  </span>
                </td>
                {comparedPapers.map((p) => {
                  const total = totalEvidenceFor(p.id);
                  return (
                    <td key={p.id} className="!border-l-2 !border-l-[var(--border-soft)]">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="font-display text-lg font-extrabold text-[var(--cyan-ink)]">
                          {total}
                        </span>
                        <span className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider">
                          {total === 1 ? "note" : "notes"}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ PROVENANCE FOOTER ============ */}
      <p className="flex items-start gap-2 font-mono text-[10px] text-[var(--ink-muted)] leading-relaxed max-w-3xl uppercase tracking-wider border-t-2 border-dotted border-[var(--border-soft)] pt-3">
        <Scale className="w-3.5 h-3.5 text-[var(--orange-ink)] shrink-0 mt-0.5" strokeWidth={2.2} />
        Matrix reflects evidence captured in the workbench per field. Hatched cells are
        visibly missing — open the reader to extract author passages or write researcher
        notes against each field.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function MatrixRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <tr>
      <td className="!bg-[var(--bg-paper-dim)]/60 !border-r-2 !border-r-[var(--border-soft)] font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
        {label}
      </td>
      {children}
    </tr>
  );
}

function MatrixCell({ children }: { children: ReactNode }) {
  return (
    <td className="!border-l-2 !border-l-[var(--border-soft)]">
      {children}
    </td>
  );
}
