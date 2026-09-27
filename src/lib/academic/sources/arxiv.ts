import { providerFetch } from "../http";
import { identifier } from "../query";
import type { SearchFilters, AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId, extractKeywords } from "../utils";

interface ArxivAuthor {
  name?: string;
}

interface ArxivLink {
  "@href": string;
  "@type"?: string;
  "@rel"?: string;
}

interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: ArxivAuthor | ArxivAuthor[];
  link?: ArxivLink | ArxivLink[];
  "arxiv:comment"?: string;
  "arxiv:primary_category"?: { "@term"?: string };
  category?: { "@term"?: string } | { "@term"?: string }[];
  doi?: string;
  journal_ref?: string;
  extra?: { comment?: string; primaryCategory?: string };
}

interface ArxivFeed {
  entry?: ArxivEntry | ArxivEntry[];
}

/**
 * Search arXiv via its Atom API.
 * Docs: https://info.arxiv.org/help/api/index.html
 */
export async function searchArxiv(
  query: string,
  limit = 20,
  signal?: AbortSignal,
  filters: SearchFilters = {},
): Promise<AcademicPaper[]> {
  // Build a search query. arXiv supports field prefixes; we use "all:" for broad matching.
  const q = (query.match(/"[^"\n]+"|\S+/g) || []).map(term => /^(AND|OR|ANDNOT)$/.test(term) || /^[a-z_]+:/.test(term) ? term : `all:${term}`).join(' AND ').replace(/ AND (AND|OR|ANDNOT) AND /g, ' $1 ');
  const url = new URL("https://export.arxiv.org/api/query");
  const exact = identifier(query);
  if (exact?.kind === 'arxiv') url.searchParams.set('id_list', exact.value);
  else url.searchParams.set('search_query', q + (filters.yearFrom || filters.yearTo ? ` AND submittedDate:[${filters.yearFrom || 1991}01010000 TO ${filters.yearTo || new Date().getFullYear()}12312359]` : ''));
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(Math.min(limit, 50)));
  url.searchParams.set("sortBy", "relevance");
  url.searchParams.set("sortOrder", "descending");

  const res = await providerFetch(url, {
    headers: { Accept: "application/atom+xml" },
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`arXiv HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const xml = await res.text();
  if (!xml.includes("<feed")) throw new Error("Malformed arXiv response");
  const entries = parseAtomEntries(xml);
  if (entries.some(e => e.id?.includes("api/errors"))) throw new Error("arXiv rejected the query syntax");
  return entries.map((e) => mapArxivEntry(e));
}

function parseAtomEntries(xml: string): ArxivEntry[] {
  // Minimal regex-based Atom parser (avoids pulling in an XML dependency).
  const entries: ArxivEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(xml))) {
    const body = m[1];
    const entry: ArxivEntry = {};

    const idMatch = body.match(/<id>([\s\S]*?)<\/id>/);
    if (idMatch) entry.id = idMatch[1].trim();

    const titleMatch = body.match(/<title>([\s\S]*?)<\/title>/);
    if (titleMatch) entry.title = normalizeText(titleMatch[1]);

    const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
    if (summaryMatch) entry.summary = normalizeText(summaryMatch[1]);

    const publishedMatch = body.match(/<published>([\s\S]*?)<\/published>/);
    if (publishedMatch) entry.published = publishedMatch[1].trim();

    const doiMatch = body.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) || body.match(/<doi>([\s\S]*?)<\/doi>/);
    if (doiMatch) entry.doi = doiMatch[1].trim();

    const journalMatch = body.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);
    if (journalMatch) entry.journal_ref = journalMatch[1].trim();

    const commentMatch = body.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/);
    const primaryCatMatch = body.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);
    if (commentMatch || primaryCatMatch) {
      entry.extra = {
        comment: commentMatch?.[1]?.trim(),
        primaryCategory: primaryCatMatch?.[1],
      };
    }

    const authors: ArxivAuthor[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let am: RegExpExecArray | null;
    while ((am = authorRegex.exec(body))) {
      authors.push({ name: am[1].trim() });
    }
    if (authors.length) entry.author = authors;

    const links: ArxivLink[] = [];
    const linkRegex = /<link\s+([^>]+?)\/>/g;
    let lm: RegExpExecArray | null;
    while ((lm = linkRegex.exec(body))) {
      const attrs = lm[1];
      const href = attrs.match(/href="([^"]+)"/)?.[1];
      const type = attrs.match(/type="([^"]+)"/)?.[1];
      const rel = attrs.match(/rel="([^"]+)"/)?.[1];
      if (href) links.push({ "@href": href, "@type": type, "@rel": rel });
    }
    if (links.length) entry.link = links;

    entries.push(entry);
  }
  return entries;
}

function mapArxivEntry(e: ArxivEntry): AcademicPaper {
  const title = normalizeText(e.title) || "Untitled";
  const abstract = normalizeText(e.summary) || "No abstract available.";
  const arxivId = (e.id || "").split("/abs/")[1]?.split("v")[0] || null;
  const year = e.published ? parseInt(e.published.slice(0, 4), 10) || null : null;
  const doi = e.doi ?? null;
  const pdfLink =
    Array.isArray(e.link)
      ? e.link.find((l) => l["@type"] === "application/pdf")?.["@href"] ||
        null
      : e.link?.["@href"] || null;
  const absLink = arxivId ? `https://arxiv.org/abs/${arxivId}` : null;

  return {
    id: buildId("arxiv", arxivId || doi || title.slice(0, 60)),
    title,
    authors: (Array.isArray(e.author) ? e.author : e.author ? [e.author] : [])
      .map((a) => a.name || "")
      .filter(Boolean),
    abstract,
    year,
    doi,
    identifiers: { arxiv: arxivId || undefined },
    pdfLink,
    citationCount: null, // Not supplied by arXiv
    publisher: "arXiv",
    sources: ["arXiv"],
    sourceUrls: absLink ? [{ source: "arXiv", url: absLink }] : [],
    keywords: extractKeywords(title, abstract),
    openAccess: true, // arXiv is always open access
    paperType: "preprint",
    venue: e.journal_ref || e.extra?.primaryCategory || "arXiv",
  };
}
