import { providerFetch } from "../http";
import { identifier } from "../query";
import type { SearchFilters, AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId, extractKeywords } from "../utils";

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  "container-title"?: string[];
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  author?: CrossrefAuthor[];
  "is-referenced-by-count"?: number;
  abstract?: string;
  "publisher"?: string;
  "type"?: string;
  link?: { URL?: string; "content-type"?: string }[];
  license?: { URL?: string; start?: { "date-parts"?: number[][] } }[];
  subject?: string[];
  "short-container-title"?: string[];
}

interface CrossrefResponse {
  message?: {
    items?: CrossrefItem[];
    "total-results"?: number;
  };
  error?: string;
}

/**
 * Search Crossref's works endpoint.
 * Docs: https://api.crossref.org/swagger-ui/index.html
 */
export async function searchCrossref(
  query: string,
  limit = 20,
  signal?: AbortSignal,
  filters: SearchFilters = {},
): Promise<AcademicPaper[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(Math.min(limit, 50)));
  url.searchParams.set("select", "DOI,title,author,abstract,published-print,published-online,issued,created,is-referenced-by-count,publisher,type,link,license,subject,container-title,short-container-title");
  const exact = identifier(query);
  if (exact?.kind === 'doi') { url.pathname += '/' + encodeURIComponent(exact.value); url.search = ''; }
  else {
    const terms = [filters.yearFrom && `from-pub-date:${filters.yearFrom}-01-01`, filters.yearTo && `until-pub-date:${filters.yearTo}-12-31`].filter(Boolean);
    if (terms.length) url.searchParams.set('filter', terms.join(','));
    if (filters.author) url.searchParams.set('query.author', filters.author);
    url.searchParams.set('sort', 'relevance');
  }
  if (process.env.ACADEMIC_CONTACT_EMAIL) url.searchParams.set('mailto', process.env.ACADEMIC_CONTACT_EMAIL);

  const res = await providerFetch(url, {
    headers: { Accept: "application/json", "User-Agent": "KIVO/2.0 (mailto:research@kivo.local)" },
    signal,
  });
  if (res.status === 404 && exact) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Crossref HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const json = (await res.json()) as CrossrefResponse;
  if (json.error) throw new Error(`Crossref error: ${json.error}`);

  if (!json.message || (!exact && !Array.isArray(json.message.items))) throw new Error('Malformed Crossref response');
  const items = exact?.kind === 'doi' ? [json.message as CrossrefItem] : json.message.items!;
  return items.map((item) => mapCrossrefItem(item));
}

function mapCrossrefItem(item: CrossrefItem): AcademicPaper {
  const title = normalizeText(item.title?.[0]) || "Untitled";
  const abstractRaw = normalizeText(item.abstract) || "";
  // Crossref wraps abstracts in <jats:p> tags; strip them.
  const abstract = abstractRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "No abstract available.";
  const year = pickYear(item);
  const doi = item.DOI ?? null;
  const pdfLink = item.link?.find((l) => l["content-type"] === "application/pdf")?.URL ||
    null;
  const publisher = item.publisher || item["container-title"]?.[0] || null;
  const licenseStart = item.license?.[0]?.start?.["date-parts"]?.[0]?.[0];
  const isOpen = !!item.license?.some((l) => /creativecommons|open access|unrestricted/i.test(l.URL || ""));
  const sourceUrl = doi ? `https://doi.org/${doi}` : null;

  return {
    id: buildId("crossref", doi || title.slice(0, 60)),
    title,
    authors: (item.author || []).map((a) => a.name || [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    abstract,
    year,
    doi,
    identifiers: { doi: doi || undefined },
    pdfLink,
    citationCount: item["is-referenced-by-count"] ?? null,
    publisher,
    sources: ["Crossref"],
    sourceUrls: sourceUrl ? [{ source: "Crossref", url: sourceUrl }] : [],
    keywords: (item.subject || []).slice(0, 8).map((s) => s.toLowerCase()),
    openAccess: isOpen ? true : null,
    paperType: item.type || null,
    venue: item["container-title"]?.[0] || item["short-container-title"]?.[0] || null,
  };
}

function pickYear(item: CrossrefItem): number | null {
  const candidates = [
    item["published-print"]?.["date-parts"]?.[0]?.[0],
    item["published-online"]?.["date-parts"]?.[0]?.[0],
    item.issued?.["date-parts"]?.[0]?.[0],
    item.created?.["date-parts"]?.[0]?.[0],
  ];
  for (const c of candidates) {
    if (typeof c === "number") return c;
  }
  return null;
}
