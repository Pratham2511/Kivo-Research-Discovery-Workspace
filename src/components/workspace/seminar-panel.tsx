"use client";

import { useRef, useState } from "react";
import {
  Users,
  Download,
  UploadCloud,
  Copy,
  FileJson,
  Loader2,
  ShieldCheck,
  EyeOff,
  Sigma,
  CircleHelp,
  CheckCircle2,
  XCircle,
  FolderDown,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import type { Project, Workspace } from "@/lib/workspace/schema";
import {
  seminarBundleSchema,
  exportSeminarBundle,
  buildKappaReport,
  kappaMarkdown,
  type KappaReport,
  type SeminarBundle,
} from "@/lib/workspace/seminar";

interface SeminarPanelProps {
  project: Project;
  workspace: Pick<Workspace, "papers">;
  onExportBundle: (bundle: SeminarBundle) => void;
  onImportBlind: (bundle: SeminarBundle) => Promise<boolean>;
}

const DECISION_TONE: Record<string, string> = {
  include: "ticket-green",
  exclude: "ticket-red",
  maybe: "ticket-yellow",
  unscreened: "",
};

const DECISION_LABEL: Record<string, string> = {
  include: "Include",
  exclude: "Exclude",
  maybe: "Maybe",
  unscreened: "Unscreened",
};

/**
 * Seminar Mode (FUTURE_FEATURES #9) — blind peer screening + Cohen's κ.
 *
 * Bundles are self-contained JSON files that travel between students by
 * email or the LMS; nothing passes through a server. The κ report diffs the
 * imported peer bundle against the live project only — both sides must have
 * actually screened a paper for it to enter the statistic.
 */
export function SeminarPanel({
  project,
  workspace,
  onExportBundle,
  onImportBlind,
}: SeminarPanelProps) {
  const [reviewer, setReviewer] = useState("");
  const [report, setReport] = useState<KappaReport | null>(null);
  const [myName, setMyName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [pending, setPending] = useState<SeminarBundle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const screened = project.members.filter((m) => m.decision !== "unscreened");
  const myNameResolved = myName.trim() || reviewer.trim() || "me";

  const handleExport = () => {
    if (screened.length === 0) return;
    // The name entered here is also the default identity for the κ report.
    onExportBundle(exportSeminarBundle(project, workspace, reviewer.trim() || "reviewer"));
  };

  const handleFile = async (file: File) => {
    setIsParsing(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That file is not valid JSON.");
      }
      const bundle = seminarBundleSchema.safeParse(parsed);
      if (!bundle.success) {
        throw new Error(
          "That file is not a KIVO seminar bundle (v1). Ask your peer to export it from the Seminar tab.",
        );
      }
      setPending(bundle.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The bundle could not be read");
    } finally {
      setIsParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Two honest destinations, chosen explicitly by the user in the dialog.
  const goBlind = async () => {
    if (!pending) return;
    const bundle = pending;
    setPending(null);
    const ok = await onImportBlind(bundle);
    if (ok) {
      toast.success(`Blind seminar project created — ${bundle.papers.length} papers queued`);
    } else {
      toast.error("The seminar project could not be created");
    }
    setReport(null);
  };

  const goKappa = () => {
    if (!pending) return;
    const r = buildKappaReport(project, pending, workspace);
    setPending(null);
    if (
      r.stats.n === 0 &&
      r.onlyTheirs.length === 0 &&
      r.onlyMine.length === 0 &&
      r.notInMine.length === 0
    ) {
      toast.error(
        "None of this bundle's papers are in the current project — import it as a blind seminar instead, or switch to the project it belongs to.",
      );
      setReport(null);
    } else {
      setReport(r);
      toast.success(
        r.stats.kappa === null
          ? "κ is undefined for this pair — see the report"
          : `κ = ${r.stats.kappa.toFixed(2)} (${r.stats.band})`,
      );
    }
  };

  const copyReport = () => {
    if (!report) return;
    void navigator.clipboard
      .writeText(kappaMarkdown(report, myNameResolved))
      .then(() => toast.success("κ report copied as Markdown"))
      .catch(() => toast.error("Clipboard unavailable in this browser"));
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([kappaMarkdown(report, myNameResolved)], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kappa-report — ${report.bundle.projectName}.md`.replaceAll(" ", "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-rise">
      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="seminar-step">
          <span className="step-index">1</span>
          <div className="space-y-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--orange-ink)]">
              Export your screening
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--ink-body)]">
              A JSON bundle with the project brief, the papers, and your decisions so far — send it to your seminar partner.
            </p>
          </div>
        </div>
        <div className="seminar-step">
          <span className="step-index">2</span>
          <div className="space-y-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--orange-ink)]">
              They screen blind
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--ink-body)]">
              Importing never shows or applies the exporter&apos;s decisions — the peer screens the same papers from a clean slate.
            </p>
          </div>
        </div>
        <div className="seminar-step">
          <span className="step-index">3</span>
          <div className="space-y-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--orange-ink)]">
              Import back → κ report
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--ink-body)]">
              KIVO diffs their bundle against this project: Cohen&apos;s κ over co-screened papers, plus every disagreement side by side.
            </p>
          </div>
        </div>
      </div>

      {/* Export + import cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bench-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <Download className="w-4 h-4 text-[var(--orange-ink)]" strokeWidth={2.2} />
            <h3 className="stamp-label">
              <span className="stamp-underline">Export my screening</span>
            </h3>
          </div>
          <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
            {screened.length} of {project.members.length} papers screened ·
            bundle travels as a file — no server, no account.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Your name (stamped on the bundle)"
              maxLength={120}
              className="field-input flex-1"
              aria-label="Your name for the seminar bundle"
            />
            <button
              type="button"
              onClick={handleExport}
              disabled={screened.length === 0}
              className="btn btn-accent-orange btn-chip text-[10.5px] font-mono uppercase tracking-wider"
              title={
                screened.length === 0
                  ? "Screen at least one paper before exporting"
                  : "Download this project's seminar bundle"
              }
            >
              <FileJson className="w-3.5 h-3.5" strokeWidth={2.4} />
              <span>Download bundle</span>
            </button>
          </div>
          {screened.length === 0 && (
            <p className="text-[11px] font-bold text-[var(--ink-muted)] leading-relaxed">
              Nothing screened yet — the bundle would be all brief and no judgements.
            </p>
          )}
        </div>

        <div className="bench-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <UploadCloud className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
            <h3 className="stamp-label">
              <span className="stamp-underline">Import a peer&apos;s bundle</span>
            </h3>
          </div>
          <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
            Choose after picking the file: screen it blind here, or run the κ
            report against “{project.name}”.
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isParsing}
            className="btn btn-accent-cyan btn-chip text-[10.5px] font-mono uppercase tracking-wider"
          >
            {isParsing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.4} />
            ) : (
              <FolderDown className="w-3.5 h-3.5" strokeWidth={2.4} />
            )}
            <span>{isParsing ? "Reading…" : "Pick bundle file"}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <div className="flex items-center gap-2 text-[var(--ink-muted)]">
            <EyeOff className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
            <p className="text-[11px] leading-relaxed">
              Blind guarantee: the importer never renders the exporter&apos;s
              decisions — blindness is procedural, and the file itself remains
              readable JSON your peer chose to send you.
            </p>
          </div>
        </div>
      </div>

      {/* κ report */}
      {report && (
        <div className="bench-card p-5 sm:p-6 space-y-5 animate-rise">
          <div className="flex flex-wrap items-center gap-2.5">
            <Users className="w-4 h-4 text-[var(--orange-ink)]" strokeWidth={2.2} />
            <h3 className="stamp-label">
              <span className="stamp-underline">Agreement report</span>
            </h3>
            <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[30px]" />
            <span className="ticket ticket-orange !py-0.5">
              <span>
                {myNameResolved} vs {report.bundle.exportedBy}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="kappa-hero">
              <span className="kappa-band">Cohen&apos;s κ</span>
              <span className="kappa-value">
                {report.stats.kappa === null ? "—" : report.stats.kappa.toFixed(2)}
              </span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                {report.stats.kappa === null
                  ? "undefined — see note"
                  : `${report.stats.band} agreement`}
              </span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Raw agreement</span>
              <span className="stat-value">
                {Math.round(report.stats.observed * 100)}%
              </span>
              <span className="stat-sub">
                of {report.stats.n} co-screened · chance {Math.round(report.stats.expected * 100)}%
              </span>
            </div>
            <div className="stat-cell tone-orange">
              <span className="stat-label">Disagreements</span>
              <span className="stat-value text-[var(--orange-ink)]">
                {report.disagreements.length}
              </span>
              <span className="stat-sub">
                {report.agreements.length} agreed · {report.onlyTheirs.length} only them · {report.onlyMine.length} only me
              </span>
            </div>
          </div>

          {report.stats.kappa === null && (
            <div className="flex items-start gap-2.5 border-2 border-[var(--yellow)] bg-[var(--yellow-wash)] rounded-[var(--radius-cut)] px-3.5 py-3">
              <CircleHelp className="w-4 h-4 mt-0.5 shrink-0 text-[var(--yellow-ink)]" strokeWidth={2.2} />
              <p className="text-xs font-bold text-[var(--yellow-ink)] leading-relaxed">
                κ is undefined here: it needs co-screened papers, and its
                denominator collapses when every co-screened paper lands in a
                single category. The raw agreement above is still honest —
                screen more papers together, across categories, and κ
                resolves.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Sigma className="w-3 h-3" strokeWidth={2.4} />
              κ = (P<span className="lowercase">observed</span> − P<span className="lowercase">chance</span>) ÷ (1 − P<span className="lowercase">chance</span>)
            </span>
            <span>
              Mine {report.stats.mine.include}I / {report.stats.mine.exclude}E / {report.stats.mine.maybe}M
            </span>
            <span>
              Theirs {report.stats.theirs.include}I / {report.stats.theirs.exclude}E / {report.stats.theirs.maybe}M
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" strokeWidth={2.4} />
              Landis &amp; Koch 1977 bands · computed locally
            </span>
          </div>

          {/* Disagreement rows */}
          {report.disagreements.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--red-ink)]">
                Disagreements to discuss ({report.disagreements.length})
              </h4>
              <div className="bench-scroll space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {report.disagreements.map((d) => (
                  <div key={d.paperId} className="diff-row is-both-screened">
                    <p className="text-[13px] font-bold text-[var(--ink-heading)] leading-snug">
                      {d.title}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className={`ticket ${DECISION_TONE[d.mine]} !py-0.5`}>
                          <span>Mine · {DECISION_LABEL[d.mine]}</span>
                        </span>
                        <p className="text-[11.5px] italic leading-relaxed text-[var(--ink-body)]">
                          {d.myReason || "— no reason recorded"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className={`ticket ${DECISION_TONE[d.theirs]} !py-0.5`}>
                          <span>Theirs · {DECISION_LABEL[d.theirs]}</span>
                        </span>
                        <p className="text-[11.5px] italic leading-relaxed text-[var(--ink-body)]">
                          {d.theirReason || "— no reason recorded"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Only-one-side rows */}
          {report.onlyTheirs.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--violet-ink)]">
                Screened only by {report.bundle.exportedBy} ({report.onlyTheirs.length})
              </h4>
              <div className="bench-scroll space-y-2 max-h-64 overflow-y-auto pr-1">
                {report.onlyTheirs.map((r) => (
                  <div key={r.paperId} className="diff-row is-only-them">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <p className="text-[12.5px] font-bold text-[var(--ink-heading)] leading-snug">
                        {r.title}
                      </p>
                      <span className={`ticket ${DECISION_TONE[r.theirs]} !py-0.5`}>
                        <span>{DECISION_LABEL[r.theirs]}</span>
                      </span>
                    </div>
                    {r.theirReason && (
                      <p className="text-[11.5px] italic leading-relaxed text-[var(--ink-body)]">
                        “{r.theirReason}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.onlyMine.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Screened only by me ({report.onlyMine.length}) — not part of κ
              </h4>
              <div className="bench-scroll space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {report.onlyMine.map((r) => (
                  <div
                    key={r.paperId}
                    className="flex flex-wrap items-center gap-2 justify-between border-1.5 border-dotted border-[var(--border-soft)] rounded-[var(--radius-cut)] px-3 py-2"
                  >
                    <p className="text-[12px] text-[var(--ink-body)] leading-snug">
                      {r.title}
                    </p>
                    <span className={`ticket ${DECISION_TONE[r.mine]} !py-0.5`}>
                      <span>{DECISION_LABEL[r.mine]}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.notInMine.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--violet-ink)]">
                In their bundle, not queued here ({report.notInMine.length})
              </h4>
              <div className="bench-scroll space-y-2 max-h-64 overflow-y-auto pr-1">
                {report.notInMine.map((r) => (
                  <div
                    key={r.paperId}
                    className="flex flex-wrap items-center gap-2 justify-between border-1.5 border-dotted border-[var(--border-soft)] rounded-[var(--radius-cut)] px-3 py-2"
                  >
                    <p className="text-[12px] text-[var(--ink-body)] leading-snug">
                      {r.title}
                    </p>
                    <span className={`ticket ${DECISION_TONE[r.theirs]} !py-0.5`}>
                      <span>{DECISION_LABEL[r.theirs]}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.stats.n > 0 && report.disagreements.length === 0 && (
            <div className="flex items-center gap-2.5 border-2 border-[var(--green)] bg-[var(--green-wash)] rounded-[var(--radius-cut)] px-3.5 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--green-ink)]" strokeWidth={2.2} />
              <p className="text-xs font-bold text-[var(--green-ink)] leading-relaxed">
                Perfect agreement on all {report.stats.n} co-screened papers. Either a crisp protocol or a shared bias — the seminar can decide which.
              </p>
            </div>
          )}

          {/* Report actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t-2 border-dotted border-[var(--border-soft)]">
            <input
              type="text"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="Your name for the report header"
              maxLength={120}
              className="field-input !w-[220px] !py-1.5 !text-[11px]"
              aria-label="Your name for the report header"
            />
            <span className="flex-1" />
            <button
              type="button"
              onClick={copyReport}
              className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
            >
              <Copy className="w-3 h-3" strokeWidth={2.4} />
              <span>Copy as Markdown</span>
            </button>
            <button
              type="button"
              onClick={downloadReport}
              className="btn btn-accent-orange btn-chip text-[9.5px] font-mono uppercase tracking-wider"
            >
              <Download className="w-3 h-3" strokeWidth={2.4} />
              <span>Download .md</span>
            </button>
            <button
              type="button"
              onClick={() => setReport(null)}
              className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
            >
              <XCircle className="w-3 h-3" strokeWidth={2.4} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}

      {/* Parsed-bundle dialog — the honest fork: screen blind, or run κ. */}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import seminar bundle"
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/45"
          onClick={() => setPending(null)}
        >
          <div
            className="bench-card max-w-lg w-full p-6 space-y-4 animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-[var(--orange-ink)]" strokeWidth={2.2} />
              <h3 className="stamp-label">
                <span className="stamp-underline">Bundle received</span>
              </h3>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-[var(--ink-heading)] leading-snug">
                “{pending.projectName}” · {pending.papers.length} papers
              </p>
              <p className="text-xs text-[var(--ink-body)] leading-relaxed">
                Exported by <strong>{pending.exportedBy}</strong> on{" "}
                {new Date(pending.exportedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                .
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void goBlind()}
                className="bench-card !shadow-none p-4 text-left space-y-2 hover:border-[var(--cyan)] transition-colors"
              >
                <EyeOff className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--cyan-ink)]">
                  Screen blind
                </p>
                <p className="text-[11.5px] leading-relaxed text-[var(--ink-body)]">
                  New seminar project, decisions wiped. Their judgements stay
                  sealed in the file, never shown.
                </p>
              </button>
              <button
                type="button"
                onClick={goKappa}
                className="bench-card !shadow-none p-4 text-left space-y-2 hover:border-[var(--orange)] transition-colors"
              >
                <Eye className="w-4 h-4 text-[var(--orange-ink)]" strokeWidth={2.2} />
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--orange-ink)]">
                  Run κ report
                </p>
                <p className="text-[11.5px] leading-relaxed text-[var(--ink-body)]">
                  Diff their decisions against “{project.name}” — co-screened
                  papers only, reasons side by side.
                </p>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
