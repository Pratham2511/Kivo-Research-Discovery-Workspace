import type { AcademicPaper, AuthorProfile, CitationContext, CitationGraph, CitationNeighbor } from "./types";
import { providerFetch } from "./http";
export async function fetchCitationGraph(
  paperId: string,
  paperTitle: string,
  type: "refs" | "cites",
): Promise<CitationGraph> {
  const s2Id = paperId.replace(/^ss--/, '');
  if (!/^(?:[0-9a-fA-F]{40}|DOI:10\.|ARXIV:|PMID:)/i.test(s2Id)) throw new Error('This paper has no supported stable citation identifier. Open a provider record instead.');

  const endpoint = type === "refs" ? "references" : "citations";
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(s2Id)}/${endpoint}?fields=title,authors,year,citationCount,abstract,externalIds,openAccessPdf,venue&limit=20`;

  const res = await providerFetch(url, {
    headers: { Accept: "application/json", ...(process.env.SEMANTIC_SCHOLAR_API_KEY ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY } : {}) }, signal: AbortSignal.timeout(10000),
  });

  if (res.status === 429)
    throw new Error(
      "Semantic Scholar is rate-limiting citation requests. Please try again in a minute.",
    );
  if (!res.ok) throw new Error(`Citation provider HTTP ${res.status}`);

  const json = (await res.json()) as {
    data?: Array<{
      citedPaper?: {
        paperId?: string;
        title?: string;
        authors?: { name?: string }[];
        year?: number;
        citationCount?: number;
        abstract?: string;
        externalIds?: { DOI?: string };
        openAccessPdf?: { url?: string };
        venue?: string;
      };
      // For /citations, the actual paper is nested under "citingPaper"
      citingPaper?: {
        paperId?: string;
        title?: string;
        authors?: { name?: string }[];
        year?: number;
        citationCount?: number;
        abstract?: string;
        externalIds?: { DOI?: string };
        openAccessPdf?: { url?: string };
        venue?: string;
      };
    }>;
  };

  const data = json.data || [];
  const neighbors: CitationNeighbor[] = data
    .map((entry) => {
      const p = type === "refs" ? entry.citedPaper : entry.citingPaper;
      if (!p || !p.title) return null;
      return {
        paperId: p.paperId || "",
        title: p.title,
        authors: (p.authors || []).map((a) => a.name || "").filter(Boolean),
        year: typeof p.year === "number" ? p.year : null,
        citationCount: p.citationCount || 0,
        abstract: p.abstract || "No abstract available.",
        doi: p.externalIds?.DOI || null,
        openAccessPdf: p.openAccessPdf?.url || null,
        venue: p.venue || null,
      } as CitationNeighbor;
    })
    .filter((n): n is CitationNeighbor => n !== null);

  return type === "refs"
    ? { references: neighbors, citations: [] }
    : { references: [], citations: neighbors };
}

/**
 * Fetch the citation contexts for a paper — the actual sentences in which
 * later papers cite it. Each context becomes one smart-citation row; the
 * client classifies stance locally with the transparent heuristic in
 * `stance.ts` (rules are shown in the UI, so classifications are citable).
 */
export async function fetchCitationContexts(
  paperId: string,
): Promise<CitationContext[]> {
  const s2Id = paperId.replace(/^ss--/, "");
  if (!/^(?:[0-9a-fA-F]{40}|DOI:10\.|ARXIV:|PMID:)/i.test(s2Id))
    throw new Error("This paper has no supported stable citation identifier.");

  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(s2Id)}/citations?fields=contexts,intents,title,year,venue&limit=100`;

  const res = await providerFetch(url, {
    headers: {
      Accept: "application/json",
      ...(process.env.SEMANTIC_SCHOLAR_API_KEY
        ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY }
        : {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 429)
    throw new Error(
      "Semantic Scholar is rate-limiting citation requests. Please try again in a minute.",
    );
  if (!res.ok) throw new Error(`Citation provider HTTP ${res.status}`);

  const json = (await res.json()) as {
    data?: Array<{
      contexts?: string[] | null;
      intents?: string[] | null;
      citingPaper?: {
        paperId?: string;
        title?: string;
        year?: number;
        venue?: string;
      };
    }>;
  };

  const rows: CitationContext[] = [];
  for (const entry of json.data || []) {
    const p = entry.citingPaper;
    if (!p || !p.title) continue;
    for (const context of entry.contexts || []) {
      const trimmed = context.trim();
      if (!trimmed) continue;
      rows.push({
        citingPaperId: p.paperId || "",
        citingTitle: p.title,
        citingYear: typeof p.year === "number" ? p.year : null,
        citingVenue: p.venue || null,
        context: trimmed.slice(0, 2000),
        intents: (entry.intents || []).slice(0, 5),
      });
      if (rows.length >= 120) return rows;
    }
  }
  return rows;
}

/**
 * Resolve a paper title to a Semantic Scholar paper id (best-match search).
 * Used as the last-resort fallback when a paper's own identifiers are not
 * indexed by S2 (e.g. NeurIPS placeholder DOIs like 10.5555/…).
 */
export async function resolveS2ByTitle(
  title: string,
): Promise<string | null> {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", title.slice(0, 200));
  url.searchParams.set("fields", "paperId,title,year");
  url.searchParams.set("limit", "1");

  const res = await providerFetch(url, {
    headers: {
      Accept: "application/json",
      ...(process.env.SEMANTIC_SCHOLAR_API_KEY
        ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY }
        : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: Array<{ paperId?: string }>;
  };
  const hit = json.data?.[0]?.paperId;
  return typeof hit === "string" && hit.length > 0 ? hit : null;
}

export async function fetchAuthorProfile(name: string): Promise<AuthorProfile> {
  const url = new URL("https://api.semanticscholar.org/graph/v1/author/search");
  url.searchParams.set("query", name);
  url.searchParams.set(
    "fields",
    "name,affiliations,paperCount,citationCount,hIndex,papers.title,papers.year,papers.citationCount,papers.abstract,papers.externalIds,papers.openAccessPdf,papers.venue",
  );
  url.searchParams.set("limit", "1");

  const res = await providerFetch(url, { headers: { Accept: "application/json", ...(process.env.SEMANTIC_SCHOLAR_API_KEY ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY } : {}) }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Semantic Scholar is rate-limiting author searches. Please try again in a minute.");
    }
    throw new Error(`Author search failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: Array<{
      name?: string;
      authorId?: string;
      affiliations?: string[];
      paperCount?: number;
      citationCount?: number;
      hIndex?: number;
      papers?: Array<{
        title?: string;
        year?: number;
        citationCount?: number;
        abstract?: string;
        externalIds?: { DOI?: string };
        openAccessPdf?: { url?: string };
        venue?: string;
        paperId?: string;
      }>;
    }>;
  };

  const author = json.data?.[0];
  if (!author) {
    return {
      name,
      affiliations: [],
      paperCount: 0,
      citationCount: 0,
      hIndex: null,
      papers: [],
    };
  }

  const papers: AcademicPaper[] = (author.papers || []).slice(0, 20).map((p, i) => ({
    id: p.paperId || `s2-author-${i}`,
    title: p.title || "Untitled",
    authors: [author.name || name],
    abstract: p.abstract || "No abstract available.",
    year: typeof p.year === "number" ? p.year : null,
    doi: p.externalIds?.DOI || null,
    pdfLink: p.openAccessPdf?.url || null,
    citationCount: p.citationCount || 0,
    publisher: p.venue || null,
    sources: ["Semantic Scholar"],
    sourceUrls: p.paperId ? [{ source: "Semantic Scholar", url: `https://www.semanticscholar.org/paper/${p.paperId}` }] : [],
    keywords: [],
    openAccess: !!p.openAccessPdf?.url,
    paperType: null,
    venue: p.venue || null,
  }));

  return {
    name: author.name || name,
    authorId: author.authorId,
    affiliations: author.affiliations || [],
    paperCount: author.paperCount || 0,
    citationCount: author.citationCount || 0,
    hIndex: author.hIndex ?? null,
    papers,
  };
}
