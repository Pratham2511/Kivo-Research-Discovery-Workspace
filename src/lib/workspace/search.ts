import type { Paper } from "./schema";

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  minCitations?: number;
  sort?: "relevance" | "year" | "citations";
}

export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_SNAPSHOT_LIMIT = 150;

export function searchValidation(query: string, filters: SearchFilters, providers: string[]): string | null {
  if (!query.trim()) return "Enter a topic, title, DOI, or arXiv ID to search.";
  if (query.trim().length > 1000) return "Keep your search under 1,000 characters.";
  if (providers.length === 0) return "Choose at least one research source.";
  for (const year of [filters.yearFrom, filters.yearTo]) {
    if (year !== undefined && (!Number.isInteger(year) || year < 1800 || year > 2100)) {
      return "Use a publication year between 1800 and 2100.";
    }
  }
  if (filters.yearFrom !== undefined && filters.yearTo !== undefined && filters.yearFrom > filters.yearTo) {
    return "The start year must be earlier than or equal to the end year.";
  }
  if (filters.minCitations !== undefined && (!Number.isInteger(filters.minCitations) || filters.minCitations < 0 || filters.minCitations > 10000000)) {
    return "Minimum citations must be a whole number between 0 and 10,000,000.";
  }
  return null;
}

/** Sorting always starts from upstream relevance order, so it is reversible. */
export function sortSearchPapers(papers: Paper[], sort: SearchFilters["sort"]): Paper[] {
  if (sort === "year") return [...papers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  if (sort === "citations") return [...papers].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  return papers;
}

export function searchPage(papers: Paper[], index: number) {
  const pages = Math.max(1, Math.ceil(papers.length / SEARCH_PAGE_SIZE));
  const page = Math.min(Math.max(0, index), pages - 1);
  return { page, pages, papers: papers.slice(page * SEARCH_PAGE_SIZE, (page + 1) * SEARCH_PAGE_SIZE) };
}
