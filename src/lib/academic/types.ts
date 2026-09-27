// Shared types for the academic paper discovery system.

export interface AcademicPaper {
  /** Stable identifier we generate to dedupe across sources. */
  id: string;
  identifiers?: { doi?: string; arxiv?: string; pmid?: string; pmcid?: string; openalex?: string; semanticScholar?: string };
  retrievedAt?: string;
  integrityNotices?: { kind: "retraction" | "correction"; source: string; url: string; retrievedAt: string }[];
  provenance?: { source: string; citationCount: number | null; retrievedAt: string }[];
  title: string;
  authors: string[];
  abstract: string;
  year: number | null;
  doi: string | null;
  pdfLink: string | null;
  citationCount: number | null;
  publisher: string | null;
  /** Original source name, e.g. "Semantic Scholar" */
  sources: string[];
  /** All known URLs for this paper across sources */
  sourceUrls: SourceUrl[];
  keywords: string[];
  openAccess: boolean | null;
  paperType: string | null;
  venue: string | null;
  /** Relevance score (0-100) assigned by the ranking engine */
  relevanceScore?: number;
  /** AI-generated insights, populated on demand */
  aiInsights?: PaperInsights;
}

export interface SourceUrl {
  source: string;
  url: string;
}

export interface PaperInsights {
  summary: string;
  keyContributions: string[];
  advantages: string[];
  limitations: string[];
  futureScope: string[];
  keywords: string[];
}

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  author?: string;
  publisher?: string;
  conference?: string;
  journal?: string;
  domain?: string;
  minCitations?: number;
  openAccessOnly?: boolean;
  includeKeywords?: string[];
  excludeKeywords?: string[];
  paperType?: string;
  methodology?: string;
  language?: string;
}

export interface SearchQuery {
  /** Raw natural-language query from the user. */
  rawQuery: string;
  filters: SearchFilters;
}

export interface AIUnderstoodQuery {
  topic: string;
  intent: string;
  keywords: string[];
  excludeKeywords: string[];
  /** Suggested search terms to send to each source. */
  searchTerms: string[];
  /** Filters extracted or confirmed by the AI. */
  filters: SearchFilters;
  reasoning: string;
}

export interface SourceResult {
  source: string;
  papers: AcademicPaper[];
  success: boolean;
  status?: "success" | "empty" | "partial" | "timeout" | "rate-limited" | "unconfigured" | "failed";
  error?: string;
  durationMs: number;
}

export interface SearchResult {
  papers: AcademicPaper[];
  sources: SourceResult[];
  understoodQuery: AIUnderstoodQuery;
  totalFound: number;
  duplicatesRemoved: number;
  retrievedCount?: number;
  filteredCount?: number;
  error?: string;
  cursor?: string | null;
  coverage?: string;
  durationMs: number;
}

export const ACADEMIC_SOURCES = [
  "Semantic Scholar",
  "arXiv",
  "Crossref",
  "PubMed",
  "OpenAlex",
  "IEEE Xplore",
  "bioRxiv",
  "medRxiv",
  "Europe PMC",
  "CORE",
] as const;

export type AcademicSourceName = (typeof ACADEMIC_SOURCES)[number];

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Evidence Synthesis
// ──────────────────────────────────────────────────────────────────────────
export interface EvidenceSynthesis {
  summary: string;
  consensus: string;
  contradictions: string;
  researchGaps: string[];
  methodologies: string[];
  keyFindings: string[];
  suggestedQueries: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Citation Network (for Visual Paper Network view)
// ──────────────────────────────────────────────────────────────────────────
export interface NetworkNode {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  citationCount: number | null;
  relevanceScore?: number;
  doi: string | null;
  source: string;
  /** Whether this node was in the original search results or a fetched neighbor */
  isSeed: boolean;
}

export interface NetworkEdge {
  /** ID of the citing paper */
  source: string;
  /** ID of the cited paper */
  target: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Author Profile
// ──────────────────────────────────────────────────────────────────────────
export interface AuthorProfile {
  name: string;
  authorId?: string;
  affiliations: string[];
  paperCount: number;
  citationCount: number | null;
  hIndex: number | null;
  papers: AcademicPaper[];
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Citation Graph (references & citations of a single paper)
// ──────────────────────────────────────────────────────────────────────────
export interface CitationNeighbor {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  citationCount: number | null;
  abstract: string;
  doi: string | null;
  openAccessPdf: string | null;
  venue: string | null;
}

export interface CitationGraph {
  references: CitationNeighbor[];
  citations: CitationNeighbor[];
}

/**
 * One citation context — the sentence(s) in which a citing paper references
 * the cited paper. Raw material for smart-citation stance classification.
 */
export interface CitationContext {
  citingPaperId: string;
  citingTitle: string;
  citingYear: number | null;
  citingVenue: string | null;
  context: string;
  intents: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Collections
// ──────────────────────────────────────────────────────────────────────────
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  paperCount: number;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Search Alerts
// ──────────────────────────────────────────────────────────────────────────
export interface SearchAlert {
  id: string;
  query: string;
  filters: SearchFilters;
  frequency: "daily" | "weekly";
  createdAt: string;
  lastRunAt: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Paper Q&A
// ──────────────────────────────────────────────────────────────────────────
export interface PaperQARecord {
  id: string;
  paperId: string;
  question: string;
  answer: string;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// V2 TYPES — Per-source badge color (UI hint)
// ──────────────────────────────────────────────────────────────────────────
export const SOURCE_BADGE_COLORS: Record<string, string> = {
  "Semantic Scholar": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "arXiv": "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
  "Crossref": "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  "PubMed": "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "OpenAlex": "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "IEEE Xplore": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  "bioRxiv": "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  "medRxiv": "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
  "Europe PMC": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "CORE": "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
};
