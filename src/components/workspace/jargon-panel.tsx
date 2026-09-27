"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Glasses,
  ChevronDown,
  Highlighter,
  Loader2,
  ShieldCheck,
  Sparkles,
  Copy,
  RotateCcw,
  Sigma,
  Type,
  BookMarked,
} from "lucide-react";
import { toast } from "sonner";
import type { Paper } from "./paper-card";
import {
  detectJargon,
  segmentAbstract,
  glossTerms,
  type JargonMatch,
} from "@/lib/reading/jargon";
import { readability, readingLevel } from "@/lib/reading/readability";

interface GlossResult {
  rewrite: string | null;
  keptTerms: string[];
  numbersTotal: number;
  reason?:
    | "no-terms"
    | "verification-failed"
    | "model-unavailable"
    | "not-configured";
  cached?: boolean;
}

const ABSTAIN_TEXT: Record<
  "no-terms" | "verification-failed" | "model-unavailable" | "not-configured",
  string
> = {
  "no-terms":
    "No lexicon terms were found in this abstract — there is nothing to gloss.",
  "verification-failed":
    "The rewrite kept dropping technical terms or numbers from the original, so it was refused. This is the no-distortion contract working as designed — the desk would rather show you the original than a quietly lossy copy.",
  "model-unavailable":
    "The plain-language editor is unreachable right now. Try again in a moment.",
  "not-configured":
    "No AI provider is configured on this desk, so the plain-language rewrite is switched off. Set LLM_API_KEY (plus optional LLM_BASE_URL / LLM_MODEL — any OpenAI-compatible endpoint works; see the README) to enable it. The grade, heatmap and glossary above are computed locally and always work.",
};

const DENSITY_TONE: Record<string, string> = {
  light: "ticket-green",
  moderate: "ticket-yellow",
  heavy: "ticket-orange",
  "very-heavy": "ticket-red",
};

/**
 * "Make it approachable" — reading level, jargon heatmap, and a verified
 * plain-language rewrite of the abstract (FUTURE_FEATURES #11).
 *
 * The FK score and the heatmap are pure local computation over the bundled
 * lexicon; the AI rewrite only ships when the server has mechanically
 * verified that every technical term and every number survived it.
 */
export function JargonPanel({ paper }: { paper: Paper }) {
  const [open, setOpen] = useState(false);
  const [heatmap, setHeatmap] = useState(true);
  const [gloss, setGloss] = useState<GlossResult | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);

  const report = useMemo(
    () => (paper.abstract ? detectJargon(paper.abstract) : null),
    [paper.abstract],
  );
  const rewriteStats = useMemo(
    () => (gloss?.rewrite ? readability(gloss.rewrite) : null),
    [gloss?.rewrite],
  );

  // Reset when the paper changes underneath the reader.
  useEffect(() => {
    setGloss(null);
  }, [paper.id]);

  if (!paper.abstract) return null;

  const runRewrite = async () => {
    if (!report || report.uniqueTerms.length === 0) return;
    setIsRewriting(true);
    try {
      const res = await fetch("/api/gloss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId: paper.id,
          abstract: paper.abstract,
          terms: glossTerms(report),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "The plain-language editor could not be reached.",
        );
      }
      const data: GlossResult = await res.json();
      setGloss(data);
      if (data.rewrite) toast.success("Plain-language rewrite verified");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The plain-language editor could not be reached.",
      );
    } finally {
      setIsRewriting(false);
    }
  };

  const copyRewrite = () => {
    if (!gloss?.rewrite) return;
    const lines = [
      `Plain-language rewrite of “${paper.title}”`,
      "",
      gloss.rewrite,
      "",
      "— every technical term and number verified intact against the original abstract (KIVO no-distortion contract).",
    ];
    void navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.success("Rewrite copied"))
      .catch(() => toast.error("Clipboard unavailable in this browser"));
  };

  const segments = report ? segmentAbstract(paper.abstract, report.matches) : [];

  return (
    <section className="bench-card p-5 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center gap-2.5 text-left"
        aria-expanded={open}
      >
        <Glasses className="w-4 h-4 text-[var(--yellow-ink)] shrink-0" strokeWidth={2.2} />
        <h2 className="stamp-label">
          <span className="stamp-underline">Make it approachable</span>
        </h2>
        <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[30px]" />
        <span className="ticket ticket-yellow !py-0.5" title="Flesch–Kincaid grade of this abstract">
          <span>
            Grade {report?.stats.grade ?? "—"} · {report?.level.label ?? "—"}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {open && report && (
        <div className="space-y-5 animate-rise">
          {/* Reading-level stat strip — 2×2: the reader's left column is too
              narrow for four 30px stat values side by side. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-cell tone-yellow">
              <span className="stat-label">Reading grade</span>
              <span className="stat-value text-[var(--yellow-ink)]">
                {report.stats.grade}
              </span>
              <span className="stat-sub">{report.level.label}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Jargon terms</span>
              <span className="stat-value">
                {report.uniqueTerms.length}
                {report.hits > report.uniqueTerms.length ? (
                  <span className="text-sm font-bold text-[var(--ink-muted)]">
                    {" "}
                    ({report.hits} hits)
                  </span>
                ) : null}
              </span>
              <span className="stat-sub">from the bundled lexicon</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Density</span>
              <span className="stat-value">
                {report.density.per100}
                <span className="text-sm font-bold text-[var(--ink-muted)]">/100w</span>
              </span>
              <span className="stat-sub">{report.density.label}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Sentence length</span>
              <span className="stat-value">
                {report.stats.avgSentence}
                <span className="text-sm font-bold text-[var(--ink-muted)]"> words</span>
              </span>
              <span className="stat-sub">average, {report.stats.sentences} sentences</span>
            </div>
          </div>

          <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
            {report.level.blurb} Grade is Flesch–Kincaid (syllable + sentence
            heuristics) — an estimate, disclosed, not a verdict.
          </p>

          {/* Heatmap toggle + highlighted abstract */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHeatmap((v) => !v)}
                className={`btn btn-chip text-[10px] font-mono uppercase tracking-wider ${
                  heatmap ? "btn-accent-yellow" : "btn-ghost"
                }`}
                aria-pressed={heatmap}
              >
                <Highlighter className="w-3.5 h-3.5" strokeWidth={2.4} />
                <span>{heatmap ? "Heatmap on" : "Heatmap off"}</span>
              </button>
              <span className={`ticket !py-0.5 ${DENSITY_TONE[report.density.band]}`}>
                <span>{report.density.label}</span>
              </span>
            </div>

            {heatmap ? (
              <div
                className="text-[15px] sm:text-base text-[var(--ink-body)] leading-[1.8] whitespace-pre-line border-l-4 border-[var(--yellow)] pl-4"
                aria-label="Abstract with jargon terms highlighted"
              >
                {segments.map((seg, i) =>
                  seg.match ? (
                    <mark
                      key={i}
                      className="jargon-term"
                      title={`${seg.match.term} — ${seg.match.gloss}`}
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </div>
            ) : (
              <div className="border-2 border-dotted border-[var(--border-soft)] rounded-[var(--radius-cut)] px-4 py-3 text-center">
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] leading-relaxed">
                  Turn the heatmap on to highlight every detected term — hover
                  a highlight for its plain-language gloss.
                </p>
              </div>
            )}
          </div>

          {/* Glossary */}
          {report.uniqueTerms.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <BookMarked className="w-3.5 h-3.5 text-[var(--yellow-ink)]" strokeWidth={2.4} />
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-heading)]">
                  Glossary · {report.uniqueTerms.length} terms
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {report.uniqueTerms.map((t) => (
                  <div key={t.term} className="gloss-card">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-[var(--yellow-ink)]">
                        {t.term}
                      </span>
                      {t.count > 1 && (
                        <span className="ticket !py-0 !px-1.5 text-[9px]">
                          <span>×{t.count}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-[var(--ink-body)]">
                      {t.gloss}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI plain-language rewrite */}
          <div className="space-y-3 border-t-2 border-dotted border-[var(--border-soft)] pt-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--magenta-ink)]" strokeWidth={2.4} />
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-heading)]">
                  Plain-language rewrite (AI, verified)
                </h3>
              </div>
              {report.uniqueTerms.length === 0 ? (
                <span className="ticket !py-0.5">
                  <span>No jargon found — nothing to rewrite</span>
                </span>
              ) : gloss?.rewrite ? (
                <button
                  type="button"
                  onClick={() => void runRewrite()}
                  disabled={isRewriting}
                  className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={2.4} />
                  <span>Regenerate</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runRewrite()}
                  disabled={isRewriting || report.uniqueTerms.length === 0}
                  className="btn btn-accent-magenta btn-chip text-[10px] font-mono uppercase tracking-wider"
                >
                  {isRewriting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.4} />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.4} />
                  )}
                  <span>{isRewriting ? "Rewriting · verifying…" : "Rewrite plainly"}</span>
                </button>
              )}
            </div>

            <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
              The rewrite only ships if every technical term and every number
              from the original survive it — checked mechanically on the
              server, or the rewrite is refused.
            </p>

            {isRewriting && (
              <div className="flex items-center gap-2.5 px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--magenta-ink)]" strokeWidth={2.4} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                  Rewriting · checking terms · checking numbers…
                </span>
              </div>
            )}

            {!isRewriting && gloss && gloss.rewrite && (
              <div className="paper-slip p-4 space-y-3 animate-rise">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ticket ticket-green !py-0.5">
                    <ShieldCheck className="w-3 h-3" strokeWidth={2.4} />
                    <span>Verified · {gloss.keptTerms.length} terms kept</span>
                  </span>
                  <span className="ticket ticket-green !py-0.5">
                    <Sigma className="w-3 h-3" strokeWidth={2.4} />
                    <span>{gloss.numbersTotal} numbers intact</span>
                  </span>
                  {rewriteStats && (
                    <span className="ticket ticket-violet !py-0.5">
                      <Type className="w-3 h-3" strokeWidth={2.4} />
                      <span>
                        Grade {report.stats.grade} → {rewriteStats.grade}
                      </span>
                    </span>
                  )}
                  {gloss.cached && (
                    <span className="ticket !py-0.5">
                      <span>cached</span>
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-[var(--ink-body)] leading-[1.75]">
                  {gloss.rewrite}
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={copyRewrite}
                    className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
                  >
                    <Copy className="w-3 h-3" strokeWidth={2.4} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            )}

            {!isRewriting && gloss && !gloss.rewrite && gloss.reason && (
              <div className="flex items-start gap-2.5 border-2 border-[var(--yellow)] bg-[var(--yellow-wash)] rounded-[var(--radius-cut)] px-3.5 py-3">
                <span className="stamp-label !text-[var(--yellow-ink)] shrink-0">
                  <span className="stamp-underline">Refused</span>
                </span>
                <p className="text-xs font-bold text-[var(--yellow-ink)] leading-relaxed">
                  {ABSTAIN_TEXT[gloss.reason]}
                </p>
              </div>
            )}
          </div>

          {/* Method disclosure */}
          <details className="border-t-2 border-dotted border-[var(--border-soft)] pt-3 group">
            <summary className="cursor-pointer font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)] hover:text-[var(--ink-heading)] list-none flex items-center gap-1.5">
              <ChevronDown
                className="w-3 h-3 transition-transform group-open:rotate-180"
                strokeWidth={2.4}
              />
              How this is computed
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)] font-mono">
              Flesch–Kincaid grade = 0.39 × (words ÷ sentences) + 11.8 ×
              (syllables ÷ words) − 15.59, with syllables estimated by the
              vowel-group heuristic. Jargon = longest-first match against the
              bundled lexicon in src/lib/reading/lexicon.ts ({report.uniqueTerms.length} terms found
              here; the lexicon is static, auditable and versioned in the
              repo). The AI rewrite never alters detection — it only rewrites
              around terms the lexicon already found, under the
              no-distortion contract.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
