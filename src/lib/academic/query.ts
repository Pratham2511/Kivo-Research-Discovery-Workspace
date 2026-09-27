import type { AIUnderstoodQuery, SearchFilters } from "./types";
export function prepareQuery(
  query: string,
  filters: SearchFilters = {},
): AIUnderstoodQuery {
  return {
    topic: query,
    intent: "Find records matching the original query",
    keywords: query.toLowerCase().match(/[\p{L}\p{N}-]{2,}/gu) || [],
    excludeKeywords: filters.excludeKeywords || [],
    searchTerms: [query],
    filters: { ...filters },
    reasoning:
      "Original query; explicit filters; deterministic relevance ranking. No AI used.",
  };
}
export function identifier(
  query: string,
): { kind: "doi" | "arxiv"; value: string } | null {
  const q = query
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi.org\//i, "")
    .replace(/^doi:\s*/i, "");
  if (/^10\.\d{4,9}\/\S+$/i.test(q))
    return { kind: "doi", value: q.toLowerCase() };
  const a = query
    .trim()
    .replace(/^https?:\/\/arxiv.org\/(?:abs|pdf)\//i, "")
    .replace(/^arxiv:\s*/i, "")
    .replace(/\.pdf$/, "");
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/.test(a)
    ? { kind: "arxiv", value: a }
    : null;
}
