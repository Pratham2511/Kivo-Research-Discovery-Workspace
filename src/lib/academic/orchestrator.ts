import type {
  AcademicPaper,
  AIUnderstoodQuery,
  SearchFilters,
  SearchResult,
  SourceResult,
} from "./types";
import { searchCrossref } from "./sources/crossref";
import { searchArxiv } from "./sources/arxiv";
import { searchEuropePMC } from "./sources/europepmc";
import { searchOpenAlex } from "./sources/openalex";
import { searchSemanticScholar } from "./sources/semantic-scholar";
import { searchIEEE } from "./sources/ieee";
import { searchCore } from "./sources/core";
import { deduplicatePapers } from "./dedup";
import { applyFilters, rankPapers } from "./rank";
import { ProviderError } from "./http";
import { identifier } from "./query";

type Adapter = (
  q: string,
  limit: number,
  signal?: AbortSignal,
  filters?: SearchFilters,
) => Promise<AcademicPaper[]>;
export const DEFAULT_SOURCES = ["Crossref", "arXiv", "Europe PMC"] as const;
export const PROVIDERS: Record<
  string,
  { search: Adapter; key?: string; filters: string[] }
> = {
  Crossref: { search: searchCrossref, filters: ["year", "author"] },
  arXiv: { search: searchArxiv, filters: ["year"] },
  "Europe PMC": { search: searchEuropePMC, filters: ["year", "open access"] },
  OpenAlex: { search: searchOpenAlex, key: "OPENALEX_API_KEY", filters: [] },
  "Semantic Scholar": {
    search: searchSemanticScholar,
    key: "SEMANTIC_SCHOLAR_API_KEY",
    filters: [],
  },
  "IEEE Xplore": { search: searchIEEE, key: "IEEE_API_KEY", filters: [] },
  CORE: { search: searchCore, key: "CORE_API_KEY", filters: [] },
};
interface Options {
  perSourceLimit?: number;
  finalLimit?: number;
  timeoutMs?: number;
  overallTimeoutMs?: number;
  sources?: string[];
  expandQuery?: boolean;
  signal?: AbortSignal;
}
export async function searchMultipleSources(
  query: AIUnderstoodQuery,
  options: Options = {},
): Promise<SearchResult> {
  const start = Date.now(),
    controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Search budget exceeded", "TimeoutError"),
      ),
    options.overallTimeoutMs ?? 12000,
  );
  const exact = identifier(query.topic);
  const selected = [...new Set(options.sources || DEFAULT_SOURCES)];
  try {
    const sources: SourceResult[] = await Promise.all(
      selected.map(async (source) => {
        const at = Date.now(),
          provider = PROVIDERS[source];
        const outcome = (
          status: SourceResult["status"],
          papers: AcademicPaper[] = [],
          error?: string,
        ): SourceResult => ({
          source,
          status,
          papers,
          error,
          success:
            status === "success" || status === "empty" || status === "partial",
          durationMs: Date.now() - at,
        });
        if (
          exact &&
          !(exact.kind === "doi"
            ? source === "Crossref" || source === "Europe PMC"
            : source === "arXiv")
        )
          return outcome(
            "unconfigured",
            [],
            "This source does not support this exact identifier lookup. Choose Crossref/Europe PMC for DOI or arXiv for an arXiv ID.",
          );
        if (!provider || (provider.key && !process.env[provider.key]))
          return outcome(
            "unconfigured",
            [],
            provider?.key
              ? `Set ${provider.key} to enable this source.`
              : "This source is not enabled for dependable keyword search.",
          );
        const local = new AbortController();
        const localTimer = setTimeout(
          () =>
            local.abort(new DOMException("Source timed out", "TimeoutError")),
          options.timeoutMs ?? 10000,
        );
        try {
          const papers = await provider.search(
            query.searchTerms[0] || query.topic,
            options.perSourceLimit ?? 50,
            AbortSignal.any([signal, local.signal]),
            query.filters,
          );
          const retrievedAt = new Date().toISOString();
          for (const p of papers) {
            p.retrievedAt = retrievedAt;
            p.provenance = [
              { source, citationCount: p.citationCount, retrievedAt },
            ];
            p.paperType = normalizeType(p.paperType);
            if (p.abstract === "No abstract available.") p.abstract = "";
          }
          return outcome(papers.length ? "success" : "empty", papers);
        } catch (error) {
          const status =
            signal.aborted || local.signal.aborted
              ? "timeout"
              : error instanceof ProviderError && error.status === 429
                ? "rate-limited"
                : "failed";
          return outcome(
            status,
            [],
            status === "timeout"
              ? "Source exceeded the search deadline. Retry or choose fewer sources."
              : error instanceof Error
                ? error.message
                : "Source unavailable",
          );
        } finally {
          clearTimeout(localTimer);
        }
      }),
    );
    const raw = sources.flatMap((s) => s.papers),
      dedup = deduplicatePapers(raw);
    const filtered = applyFilters(dedup.papers, query.filters);
    const papers = rankPapers(filtered, query).slice(
      0,
      options.finalLimit ?? 150,
    );
    return {
      papers,
      sources: sources.map((s) => ({ ...s, papers: [] })),
      understoodQuery: query,
      totalFound: filtered.length,
      retrievedCount: raw.length,
      duplicatesRemoved: dedup.duplicatesRemoved,
      filteredCount: dedup.papers.length - filtered.length,
      durationMs: Date.now() - start,
      error: sources.every((s) => !s.success)
        ? "The selected sources could not complete this search. Check source details and retry."
        : undefined,
      coverage:
        "Bounded snapshot: up to 50 relevance-ordered records per selected source. Local filters apply to this snapshot; missing metadata cannot satisfy a filter. Counts are not global literature totals.",
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
function normalizeType(value: string | null): string | null {
  if (!value) return null;
  if (/review/i.test(value)) return "review";
  if (/preprint|posted-content/i.test(value)) return "preprint";
  if (/proceeding|conference/i.test(value)) return "conference";
  if (/article|journal/i.test(value)) return "article";
  return value.toLowerCase();
}
