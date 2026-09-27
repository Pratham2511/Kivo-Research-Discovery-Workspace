/**
 * Jargon detection over a paper abstract (FUTURE_FEATURES #11).
 *
 * Detection is pure lexicon matching: longest-first, case-insensitive,
 * word-boundary anchored. No model, no network — the same abstract always
 * produces the same heatmap, which is the point.
 */

import { JARGON_LEXICON, SORTED_TERMS, lookupTerm, type LexiconEntry } from "./lexicon";
import { readability, jargonDensityBand, readingLevel } from "./readability";

export interface JargonMatch {
  term: string;
  gloss: string;
  /** Character offsets into the source abstract. */
  start: number;
  end: number;
  /** 1-based occurrence index of this term. */
  occurrence: number;
}

export interface JargonReport {
  matches: JargonMatch[];
  /** Unique terms found, most frequent first. */
  uniqueTerms: Array<LexiconEntry & { count: number }>;
  /** Total term occurrences (repeats count). */
  hits: number;
  stats: ReturnType<typeof readability>;
  level: ReturnType<typeof readingLevel>;
  density: ReturnType<typeof jargonDensityBand>;
}

/**
 * Scan text for lexicon terms. Greedy longest-match-first with a simple
 * non-overlap rule: once a span is claimed, inner terms are skipped
 * ("graph neural network" suppresses the inner "neural network").
 */
export function detectJargon(text: string): JargonReport {
  const stats = readability(text);
  const matches: JargonMatch[] = [];
  const counts = new Map<string, number>();

  if (text.trim().length > 0) {
    // Pre-compute case-insensitive word-boundary regex per term (terms are
    // plain words/hyphens, so escaping is the only setup needed). An optional
    // plural suffix lets "transformers" match the term "transformer".
    const patterns = SORTED_TERMS.map((e) => ({
      entry: e,
      re: new RegExp(
        `(?<![A-Za-z-])${escapeRe(e.term)}(?:es|s)?(?![A-Za-z-])`,
        "gi",
      ),
    }));

    const claimed: Array<[number, number]> = [];
    const overlaps = (s: number, e2: number) =>
      claimed.some(([cs, ce]) => s < ce && e2 > cs);

    for (const { entry, re } of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (!overlaps(start, end)) {
          const seen = counts.get(entry.term) ?? 0;
          counts.set(entry.term, seen + 1);
          claimed.push([start, end]);
          matches.push({
            term: entry.term,
            gloss: entry.gloss,
            start,
            end,
            occurrence: seen + 1,
          });
        }
      }
    }
    matches.sort((a, b) => a.start - b.start);
  }

  const uniqueTerms = [...counts.entries()]
    .map(([term, count]) => {
      const entry = lookupTerm(term)!;
      return { term: entry.term, gloss: entry.gloss, count };
    })
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));

  const hits = matches.length;
  return {
    matches,
    uniqueTerms,
    hits,
    stats,
    level: readingLevel(stats.grade),
    density: jargonDensityBand(hits, stats.words),
  };
}

export interface AbstractSegment {
  text: string;
  match?: JargonMatch;
}

/** Split the abstract into plain and highlighted segments for rendering. */
export function segmentAbstract(abstract: string, matches: JargonMatch[]): AbstractSegment[] {
  const segments: AbstractSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ text: abstract.slice(cursor, m.start) });
    segments.push({ text: abstract.slice(m.start, m.end), match: m });
    cursor = m.end;
  }
  if (cursor < abstract.length) segments.push({ text: abstract.slice(cursor) });
  return segments;
}

/** The terms for one abstract, deduped, capped for the /api/gloss contract. */
export function glossTerms(report: JargonReport, cap = 24): string[] {
  return report.uniqueTerms.slice(0, cap).map((t) => t.term);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

export { JARGON_LEXICON };
