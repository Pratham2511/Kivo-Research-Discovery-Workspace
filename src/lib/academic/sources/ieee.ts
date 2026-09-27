import { providerFetch } from "../http";
import type { AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId, extractKeywords } from "../utils";

interface IeeeAuthor {
  full_name?: string;
}

interface IeeeAuthors {
  authors?: IeeeAuthor[];
}

interface IeeeArticle {
  title?: string;
  abstract?: string;
  authors?: IeeeAuthors;
  publication_year?: number | string;
  doi?: string;
  publication_title?: string;
  content_type?: string;
  access_type?: string;
  pdf_url?: string;
  citing_paper_count?: number | string;
  article_number?: string;
  html_url?: string;
}

interface IeeeResponse {
  articles?: IeeeArticle[];
  total_records?: number;
  error?: string;
}

const TYPE_MAP: Record<string, string> = {
  "Journals": "Journal Article",
  "Journals & Magazines": "Journal Article",
  "Conferences": "Conference Paper",
  "Conference Publications": "Conference Paper",
  "Standards": "Standard",
  "Books": "Book",
  "Book Chapters": "Book Chapter",
  "Courses": "Course",
};

/**
 * Search IEEE Xplore — critical for CS/EE/Engineering research.
 * Requires IEEE_API_KEY env var. If absent, gracefully skips (returns []).
 * Docs: https://developer.ieee.org/docs
 */
export async function searchIEEE(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AcademicPaper[]> {
  const apiKey = process.env.IEEE_API_KEY;
  if (!apiKey) {
    // Graceful skip — no API key configured.
    throw new Error("IEEE_API_KEY is not configured");
  }

  const url = new URL("https://ieeexploreapi.ieee.org/api/v1/search/articles");
  url.searchParams.set("querytext", query);
  url.searchParams.set("max_records", String(Math.min(limit, 50)));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("output_format", "json");

  const res = await providerFetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");

    throw new Error(`IEEE Xplore HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const json = (await res.json()) as IeeeResponse;
  if (json.error) throw new Error(`IEEE Xplore error: ${json.error}`);

  if (!Array.isArray(json.articles)) throw new Error("Malformed IEEE response");
  const articles = json.articles;
  return articles.map((a) => mapIeeeArticle(a));
}

function mapIeeeArticle(a: IeeeArticle): AcademicPaper {
  const title = normalizeText(a.title) || "Untitled";
  const abstract = normalizeText(a.abstract) || "No abstract available.";
  const year = typeof a.publication_year === "number"
    ? a.publication_year
    : a.publication_year
      ? parseInt(String(a.publication_year), 10) || null
      : null;
  const doi = a.doi ?? null;
  const articleNumber = a.article_number ?? null;
  const sourceUrl = a.html_url || (articleNumber ? `https://ieeexplore.ieee.org/document/${articleNumber}` : null);
  const pdfLink = a.pdf_url ?? null;

  return {
    id: buildId("ieee", articleNumber || doi || title.slice(0, 60)),
    title,
    authors: (a.authors?.authors || [])
      .map((au) => au.full_name || "")
      .filter(Boolean),
    abstract,
    year,
    doi,
    pdfLink,
    citationCount: safeNumber(a.citing_paper_count, 0),
    publisher: "IEEE",
    sources: ["IEEE Xplore"],
    sourceUrls: sourceUrl ? [{ source: "IEEE Xplore", url: sourceUrl }] : [],
    keywords: extractKeywords(title, abstract),
    openAccess: a.access_type === "OPEN_ACCESS",
    paperType: a.content_type ? (TYPE_MAP[a.content_type] || a.content_type) : null,
    venue: a.publication_title || null,
  };
}
