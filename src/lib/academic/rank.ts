import type { AcademicPaper, AIUnderstoodQuery, SearchFilters } from "./types";
import { titleKey } from "./utils";

/**
 * Apply user-defined filters (year, citations, open access, keywords, etc.)
 * BEFORE ranking. Papers that don't satisfy hard constraints are removed.
 */
export function applyFilters(papers: AcademicPaper[], filters: SearchFilters): AcademicPaper[] {
  return papers.filter((p) => {
    if (filters.yearFrom && (p.year === null || p.year < filters.yearFrom)) return false;
    if (filters.yearTo && (p.year === null || p.year > filters.yearTo)) return false;
    if (filters.minCitations && (p.citationCount == null || p.citationCount < filters.minCitations)) return false;
    if (filters.openAccessOnly && !p.openAccess) return false;
    if (filters.author) {
      const want = filters.author.toLowerCase();
      if (!p.authors.some((a) => a.toLowerCase().includes(want))) return false;
    }
    if (filters.publisher) {
      const want = filters.publisher.toLowerCase();
      const pub = (p.publisher || p.venue || "").toLowerCase();
      if (!pub.includes(want)) return false;
    }
    if (filters.conference || filters.journal) {
      const want = (filters.conference || filters.journal || "").toLowerCase();
      const venue = (p.venue || p.publisher || "").toLowerCase();
      if (!venue.includes(want)) return false;
    }
    if (filters.paperType && filters.paperType !== "any") {
      const want = filters.paperType.toLowerCase();
      const pt = (p.paperType || "").toLowerCase();
      // Exclude logic: if user said "exclude review", we drop review papers
      if (filters.paperType.startsWith("exclude:")) {
        const excl = filters.paperType.slice(8).toLowerCase();
        if (pt.includes(excl)) return false;
      } else if (!pt.includes(want)) {
        return false;
      }
    }
    if (filters.includeKeywords && filters.includeKeywords.length > 0) {
      const text = (p.title + " " + p.abstract + " " + p.keywords.join(" ")).toLowerCase();
      const hasAll = filters.includeKeywords.every((k) => text.includes(k.toLowerCase()));
      if (!hasAll) return false;
    }
    if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
      const text = (p.title + " " + p.abstract + " " + p.keywords.join(" ")).toLowerCase();
      const hasAny = filters.excludeKeywords.some((k) => text.includes(k.toLowerCase()));
      if (hasAny) return false;
    }
    return true;
  });
}

/** Relevance only: title and available text. This is not a quality measure. */
export function rankPapers(papers: AcademicPaper[], query: AIUnderstoodQuery): AcademicPaper[] {
  const terms = [...new Set(query.keywords)];
  return papers.map(p => {
    const title = titleKey(p.title), abstract = p.abstract.toLowerCase();
    const exact = title === titleKey(query.topic.replaceAll('"', ''));
    const score = exact ? 100 : terms.reduce((n,t) => n + (title.includes(t) ? 3 : abstract.includes(t) ? 1 : 0), 0) / Math.max(1, terms.length * 3) * 95;
    return { ...p, relevanceScore: Math.round(score) };
  }).sort((a,b) => b.relevanceScore-a.relevanceScore || a.id.localeCompare(b.id));
}
