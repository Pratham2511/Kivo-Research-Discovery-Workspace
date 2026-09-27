"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquareQuote,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ShieldQuestion,
  ArrowUpRight,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { CitationContext } from "@/lib/academic/types";
import { toS2IdCandidates } from "@/lib/academic/ids";
import {
  classifyStance,
  STANCE_LEXICON,
  type Stance,
} from "@/lib/academic/stance";
import type { Paper } from "./paper-card";

interface StancePanelProps {
  paper: Paper;
}

type Filter = "all" | Stance;

const STANCE_TICKET: Record<Stance, string> = {
  supporting: "ticket-green",
  contrasting: "ticket-red",
  mentioning: "ticket-violet",
};

const STANCE_ICON: Record<Stance, typeof ThumbsUp> = {
  supporting: ThumbsUp,
  contrasting: ThumbsDown,
  mentioning: MinusCircle,
};

/**
 * "How is this cited?" — smart citations for one paper.
 *
 * Fetches the citation contexts (Semantic Scholar) and classifies each one
 * locally with the transparent heuristic in `lib/academic/stance.ts`. The
 * rule list is rendered in the panel so a classification can be defended —
 * or cited — in a methods section.
 */
export function StancePanel({ paper }: StancePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contexts, setContexts] = useState<CitationContext[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [rulesOpen, setRulesOpen] = useState(false);

  const fetchContexts = useCallback(async (p: Paper) => {
    const candidates = toS2IdCandidates(p);
    setLoading(true);
    setError(null);
    let lastError: string | null = null;

    try {
      const fetchOne = async (id: string) => {
        const res = await fetch(
          `/api/citations?paperId=${encodeURIComponent(id)}&type=cites&contexts=1`,
        );
        if (!res.ok) {
          try {
            const body = await res.json();
            if (typeof body?.error === "string") lastError = body.error;
          } catch {
            /* ignore body parse issues */
          }
          return null;
        }
        const data = await res.json();
        return Array.isArray(data.contexts)
          ? (data.contexts as CitationContext[])
          : null;
      };

      let rows: CitationContext[] | null = null;
      for (const candidate of candidates) {
        rows = await fetchOne(candidate);
        if (rows !== null) break;
      }

      // Last resort: best-match title search.
      let matchedByTitle = false;
      if (rows === null && p.title) {
        const res = await fetch(
          `/api/citations?paperId=SEARCH&title=${encodeURIComponent(p.title.slice(0, 200))}&type=cites&contexts=1`,
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.contexts)) {
            rows = data.contexts as CitationContext[];
            matchedByTitle = true;
          }
        } else {
          try {
            const body = await res.json();
            if (typeof body?.error === "string") lastError = body.error;
          } catch {
            /* ignore */
          }
        }
      }

      if (rows === null) {
        if (candidates.length === 0) {
          setError(
            "This paper carries no stable Semantic Scholar identifier (DOI, arXiv, PubMed, or S2 id) — citation contexts cannot be fetched honestly.",
          );
        } else {
          setError(
            lastError ??
              "None of this paper's identifiers resolved in the Semantic Scholar index.",
          );
        }
        setContexts(null);
        return;
      }

      setContexts(rows);
      if (matchedByTitle) {
        toast.info("Contexts matched by title", {
          description:
            "This record's identifiers were not indexed by Semantic Scholar — contexts use a best title match.",
        });
      }
    } catch {
      setError("The citation provider could not be reached. Try again in a moment.");
      setContexts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset + (re)load when the panel opens or the paper changes underneath it.
  useEffect(() => {
    setContexts(null);
    setError(null);
    setFilter("all");
    if (open) void fetchContexts(paper);
  }, [paper.id, open, fetchContexts, paper]);

  const verdicts = useMemo(() => {
    if (!contexts) return [];
    return contexts.map((c) => ({ ...c, verdict: classifyStance(c.context) }));
  }, [contexts]);

  const tally = useMemo(() => {
    const t = { supporting: 0, contrasting: 0, mentioning: 0 };
    verdicts.forEach((v) => t[v.verdict.stance]++);
    return t;
  }, [verdicts]);

  const filtered = useMemo(() => {
    if (filter === "all") return verdicts;
    return verdicts.filter((v) => v.verdict.stance === filter);
  }, [verdicts, filter]);

  return (
    <section className="bench-card p-5 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 text-left group"
        aria-expanded={open}
      >
        <MessageSquareQuote className="w-4 h-4 text-[var(--orange-ink)] shrink-0" strokeWidth={2.2} />
        <h2 className="stamp-label">
          <span className="stamp-underline">How is this cited?</span>
        </h2>
        <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
        {!open && contexts && (
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="ticket ticket-green !py-0.5"><span>{tally.supporting} sup.</span></span>
            <span className="ticket ticket-red !py-0.5"><span>{tally.contrasting} con.</span></span>
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-[var(--ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {open && (
        <div className="space-y-4 animate-rise">
          <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
            Every sentence from later papers that cites this one, classified as
            supporting, contrasting, or mentioning. Rules run locally — open the
            method note below to cite them.
          </p>

          {loading && (
            <div className="flex items-center gap-3 hatch border-2 border-dashed border-[var(--border-soft)] rounded-[var(--radius-cut)] px-4 py-5">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--orange-ink)]" strokeWidth={2.4} />
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                Pulling citation contexts from Semantic Scholar…
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2.5 border-2 border-[var(--yellow)] bg-[var(--yellow-wash)] rounded-[var(--radius-cut)] px-4 py-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--yellow-ink)]" strokeWidth={2.4} />
              <div className="space-y-2">
                <p className="text-xs font-bold text-[var(--yellow-ink)] leading-relaxed">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchContexts(paper)}
                  className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && contexts && contexts.length === 0 && (
            <div className="hatch border-2 border-dashed border-[var(--border-soft)] rounded-[var(--radius-cut)] p-6 text-center text-xs text-[var(--ink-muted)] font-mono uppercase tracking-wider">
              No citation contexts available — this record may be too new or too niche for the index.
            </div>
          )}

          {!loading && !error && verdicts.length > 0 && (
            <>
              {/* Tally + filters */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`ticket ${STANCE_TICKET.supporting} py-1.5 px-3`}>
                  <ThumbsUp className="w-3 h-3" strokeWidth={2.4} />
                  <span>{tally.supporting} supporting</span>
                </span>
                <span className={`ticket ${STANCE_TICKET.contrasting} py-1.5 px-3`}>
                  <ThumbsDown className="w-3 h-3" strokeWidth={2.4} />
                  <span>{tally.contrasting} contrasting</span>
                </span>
                <span className={`ticket ${STANCE_TICKET.mentioning} py-1.5 px-3`}>
                  <MinusCircle className="w-3 h-3" strokeWidth={2.4} />
                  <span>{tally.mentioning} mentioning</span>
                </span>
                <span className="flex-1" />
                <div className="flex items-center gap-1.5">
                  {([
                    ["all", "All"],
                    ["supporting", "Support"],
                    ["contrasting", "Contrast"],
                    ["mentioning", "Mention"],
                  ] as Array<[Filter, string]>).map(([f, label]) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`btn btn-chip text-[9.5px] font-mono uppercase tracking-wider ${
                        filter === f ? "btn-ink" : "btn-ghost"
                      }`}
                      aria-pressed={filter === f}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Snippets */}
              <div className="bench-scroll space-y-2.5 max-h-[26rem] overflow-y-auto pr-1">
                {filtered.map((v, i) => {
                  const Icon = STANCE_ICON[v.verdict.stance];
                  return (
                    <article key={`${v.citingPaperId}-${i}`} className="paper-slip p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`ticket ${STANCE_TICKET[v.verdict.stance]}`}>
                            <Icon className="w-3 h-3" strokeWidth={2.4} />
                            <span className="capitalize">{v.verdict.stance}</span>
                          </span>
                          {v.verdict.matchedTerm && (
                            <span
                              className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-muted)]"
                              title="The rule that fired"
                            >
                              “{v.verdict.matchedTerm}”
                            </span>
                          )}
                          {v.intents.length > 0 && (
                            <span className="ticket ticket-cyan !py-0.5">
                              <span>{v.intents.join(", ")}</span>
                            </span>
                          )}
                        </div>
                        {v.citingYear && (
                          <span className="font-mono text-[9.5px] font-bold text-[var(--ink-muted)]">
                            {v.citingYear}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-relaxed text-[var(--ink-body)] italic border-l-4 border-[var(--border-soft)] pl-3">
                        {v.context}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[9.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider truncate">
                          {v.citingTitle}
                        </p>
                        {v.citingPaperId && (
                          <a
                            href={`https://www.semanticscholar.org/paper/${v.citingPaperId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-chip !p-1.5 shrink-0"
                            title="Open the citing paper on Semantic Scholar"
                            aria-label="Open the citing paper on Semantic Scholar"
                          >
                            <ArrowUpRight className="w-3 h-3" strokeWidth={2.4} />
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Method disclosure — auditable by design */}
              <div className="border-2 border-dotted border-[var(--border-soft)] rounded-[var(--radius-cut)]">
                <button
                  type="button"
                  onClick={() => setRulesOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
                  aria-expanded={rulesOpen}
                >
                  <ShieldQuestion className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={2.2} />
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                    How these are classified
                  </span>
                  <span className="flex-1" />
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-[var(--ink-muted)] transition-transform ${rulesOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.4}
                  />
                </button>
                {rulesOpen && (
                  <div className="px-4 pb-4 space-y-3 animate-rise">
                    <p className="text-[11px] leading-relaxed text-[var(--ink-body)]">
                      Classification is a fixed, local rule list — not a model.
                      A context is <strong>contrasting</strong> if it contains
                      any contrast marker, <strong>supporting</strong> if it
                      contains an agreement marker, otherwise{" "}
                      <strong>mentioning</strong>. Contrast markers take
                      precedence, so skeptical readings are never missed.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="ticket ticket-red"><span>Contrast markers</span></span>
                        <p className="font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
                          {STANCE_LEXICON.contrasting.join(" · ")}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <span className="ticket ticket-green"><span>Agreement markers</span></span>
                        <p className="font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
                          {STANCE_LEXICON.supporting.join(" · ")}
                        </p>
                      </div>
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                      Taxonomy follows scite.ai smart citations (Nicholson et al., 2021); heuristic baseline, cite it as such.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
