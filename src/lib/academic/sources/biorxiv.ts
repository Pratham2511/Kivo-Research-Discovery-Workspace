import { providerFetch } from "../http";
import type { AcademicPaper } from "../types";
import { normalizeText, truncate, buildId, extractKeywords } from "../utils";

interface BiorxivAuthor {
  name?: string;
}

interface BiorxivArticle {
  doi?: string;
  title?: string;
  authors?: string | BiorxivAuthor[];
  author_corresponding?: string;
  date?: string;
  abstract?: string;
  category?: string;
  server?: string;
  published?: string;
  version?: number | string;
}

interface BiorxivResponse {
  collection?: BiorxivArticle[];
  messages?: { code?: string; text?: string }[];
  total?: number;
}

type Server = "biorxiv" | "medrxiv";

/**
 * Search bioRxiv and medRxiv preprint servers.
 *
 * The bioRxiv/medRxiv content API works by date range, not keyword search.
 * Strategy:
 *   1. Fetch recent papers from both servers over the last ~3 years for freshness.
 *   2. Filter locally by keyword match in title + abstract.
 *   3. Sort by date descending and cap at {limit} per server.
 *   4. Merge and return.
 *
 * Docs: https://api.biorxiv.org/
 */
export async function searchBiorxiv(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AcademicPaper[]> {
  const keywords = extractQueryKeywords(query);
  if (keywords.length === 0) return [];

  // Use a 3-year window for "recent" preprints.
  const today = new Date();
  const startDate = new Date(today);
  startDate.setFullYear(today.getFullYear() - 3);
  const from = formatDate(startDate);
  const to = formatDate(today);

  const [bioResults, medResults] = await Promise.all([
    fetchServer("biorxiv", from, to, signal).catch((e: unknown) => {
      console.warn(`[bioRxiv] failed:`, e instanceof Error ? e.message : e);
      return [] as BiorxivArticle[];
    }),
    fetchServer("medrxiv", from, to, signal).catch((e: unknown) => {
      console.warn(`[medRxiv] failed:`, e instanceof Error ? e.message : e);
      return [] as BiorxivArticle[];
    }),
  ]);

  const filteredBio = filterAndRank(bioResults, keywords, limit, "bioRxiv");
  const filteredMed = filterAndRank(medResults, keywords, limit, "medRxiv");

  // Combine — give each server equal weight by interleaving
  const combined: AcademicPaper[] = [];
  const maxLen = Math.max(filteredBio.length, filteredMed.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < filteredBio.length) combined.push(filteredBio[i]);
    if (i < filteredMed.length) combined.push(filteredMed[i]);
  }

  return combined.slice(0, limit);
}

async function fetchServer(
  server: Server,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<BiorxivArticle[]> {
  // The API caps cursor pagination; we fetch the first 100 most-recent entries.
  // Endpoint: https://api.biorxiv.org/details/{server}/{from}/{to}/{cursor}
  const url = `https://api.biorxiv.org/details/${server}/${from}/${to}/0/json`;
  const res = await providerFetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${server} HTTP ${res.status}: ${truncate(text, 200)}`);
  }
  const json = (await res.json()) as BiorxivResponse | BiorxivResponse[];
  // API sometimes returns a single object, sometimes an array of batches
  const collections = Array.isArray(json) ? json : [json];
  const articles: BiorxivArticle[] = [];
  for (const c of collections) {
    if (c.collection) articles.push(...c.collection);
  }
  return articles;
}

function filterAndRank(
  articles: BiorxivArticle[],
  keywords: string[],
  limit: number,
  serverLabel: "bioRxiv" | "medRxiv",
): AcademicPaper[] {
  const scored = articles
    .map((a) => ({ article: a, score: scoreArticle(a, keywords) }))
    .filter((s) => s.score > 0);

  // Sort by score (relevance), then by date desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.article.date || "").localeCompare(a.article.date || "");
  });

  return scored.slice(0, limit).map((s) => mapBiorxivArticle(s.article, serverLabel));
}

function scoreArticle(a: BiorxivArticle, keywords: string[]): number {
  const title = (a.title || "").toLowerCase();
  const abstract = (a.abstract || "").toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (title.includes(kw)) score += 3;
    if (abstract.includes(kw)) score += 1;
  }
  return score;
}

function mapBiorxivArticle(a: BiorxivArticle, serverLabel: "bioRxiv" | "medRxiv"): AcademicPaper {
  const title = normalizeText(a.title) || "Untitled";
  const abstract = normalizeText(a.abstract) || "No abstract available.";
  const year = a.date ? parseInt(a.date.substring(0, 4), 10) || null : null;
  const doi = a.doi ?? null;
  const pdfLink = doi
    ? `https://www.${serverLabel}.org/content/${doi}.full.pdf`
    : null;
  const sourceUrl = doi
    ? `https://www.${serverLabel}.org/content/${doi}`
    : null;

  // Parse authors — could be a comma-separated string or an array of {name}
  let authors: string[] = [];
  if (Array.isArray(a.authors)) {
    authors = a.authors.map((au) => au.name || "").filter(Boolean);
  } else if (typeof a.authors === "string") {
    authors = a.authors.split(";").map((s) => s.trim()).filter(Boolean);
  }

  // If published in a journal, note it in venue
  const publishedNote = a.published ? `Published in journal (${a.published})` : null;

  return {
    id: buildId(serverLabel.toLowerCase(), doi || title.slice(0, 60)),
    title,
    authors,
    abstract,
    year,
    doi,
    pdfLink,
    citationCount: 0, // bioRxiv API doesn't return citation counts
    publisher: serverLabel,
    sources: [serverLabel],
    sourceUrls: sourceUrl ? [{ source: serverLabel, url: sourceUrl }] : [],
    keywords: extractKeywords(title, abstract),
    openAccess: true, // all preprints are open access
    paperType: "Preprint",
    venue: publishedNote || serverLabel,
  };
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractQueryKeywords(query: string): string[] {
  const stop = new Set([
    "a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with",
    "by", "from", "at", "as", "is", "are", "be", "this", "that", "it",
    "into", "via", "using", "use", "based", "i", "need", "want", "find",
    "search", "papers", "paper", "about", "recent", "more", "than", "less",
    "no", "not", "but", "with", "without",
  ]);
  const words = query.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [];
  return words.filter((w) => !stop.has(w)).slice(0, 8);
}
