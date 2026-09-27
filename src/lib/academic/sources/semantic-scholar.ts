import { providerFetch } from "../http";
import type { AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId } from "../utils";

interface SemanticScholarAuthor {
  name?: string;
}

interface SemanticScholarPaper {
  paperId?: string;
  externalIds?: { DOI?: string; PubMed?: string; ArXiv?: string; CorpusId?: number };
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  publicationVenue?: { name?: string; type?: string };
  authors?: SemanticScholarAuthor[];
  citationCount?: number;
  openAccessPdf?: { url?: string };
  isOpenAccess?: boolean;
  publicationTypes?: string[];
  journal?: { name?: string };
  fieldsOfStudy?: string[];
}

interface SemanticScholarResponse {
  total?: number;
  data?: SemanticScholarPaper[];
  error?: string;
}

/**
 * Search Semantic Scholar's public Graph API.
 * Docs: https://api.semanticscholar.org/graph/v1/paper/search
 */
export async function searchSemanticScholar(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AcademicPaper[]> {
  const fields = [
    "title",
    "abstract",
    "year",
    "venue",
    "publicationVenue",
    "authors",
    "citationCount",
    "openAccessPdf",
    "isOpenAccess",
    "publicationTypes",
    "journal",
    "externalIds",
    "fieldsOfStudy",
  ].join(",");

  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("fields", fields);


  const res = await providerFetch(url, {
    headers: { Accept: "application/json", ...(process.env.SEMANTIC_SCHOLAR_API_KEY ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY } : {}) },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");

    throw new Error(`Semantic Scholar HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const json = (await res.json()) as SemanticScholarResponse;
  if (json.error) throw new Error(`Semantic Scholar error: ${json.error}`);

  if (!Array.isArray(json.data)) throw new Error("Malformed Semantic Scholar response");
  const papers = json.data.filter((p) => p.title);

  return papers.map((p) => {
    const title = normalizeText(p.title);
    const abstract = normalizeText(p.abstract) || "No abstract available.";
    const doi = p.externalIds?.DOI ?? null;
    const id = buildId("ss", p.paperId || doi || title.slice(0, 60));
    const sourceUrl = p.paperId
      ? `https://www.semanticscholar.org/paper/${p.paperId}`
      : null;
    return {
      id,
      title,
      authors: (p.authors || []).map((a) => a.name || "").filter(Boolean),
      abstract,
      year: typeof p.year === "number" ? p.year : null,
      doi,
      identifiers: { semanticScholar: p.paperId || undefined, doi: doi || undefined, arxiv: p.externalIds?.ArXiv, pmid: p.externalIds?.PubMed },
      pdfLink: p.openAccessPdf?.url ?? null,
      citationCount: p.citationCount ?? null,
      publisher: p.publicationVenue?.name || p.journal?.name || p.venue || null,
      sources: ["Semantic Scholar"],
      sourceUrls: sourceUrl ? [{ source: "Semantic Scholar", url: sourceUrl }] : [],
      keywords: (p.fieldsOfStudy?.filter(Boolean) as string[] | []) ?? [],
      openAccess: p.isOpenAccess ?? null,
      paperType: p.publicationTypes?.[0] ?? null,
      venue: p.venue || p.publicationVenue?.name || null,
    };
  });
}
