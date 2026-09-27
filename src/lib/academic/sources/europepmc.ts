import { providerFetch } from "../http";
import { identifier } from "../query";
import type { SearchFilters, AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId } from "../utils";

interface EuropePmcAuthor {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

interface EuropePmcFullTextUrl {
  url?: string;
  documentStyle?: string;
}

interface EuropePmcResult {
  title?: string;
  authorString?: string;
  authorList?: { author?: EuropePmcAuthor | EuropePmcAuthor[] };
  abstractText?: string;
  pubYear?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  source?: string;
  journalTitle?: string;
  citedByCount?: number | string;
  isOpenAccess?: "Y" | "N";
  fullTextUrlList?: { fullTextUrl?: EuropePmcFullTextUrl | EuropePmcFullTextUrl[] };
  keywordList?: { keyword?: string | string[] };
  pubTypeList?: { pubType?: string | string[] };
}

interface EuropePmcResponse {
  version?: string;
  hitCount?: number;
  resultList?: { result?: EuropePmcResult[] };
  error?: string;
}

/**
 * Search Europe PMC — 42M+ life sciences publications, no API key required.
 * Docs: https://europepmc.org/RestfulWebService
 */
export async function searchEuropePMC(
  query: string,
  limit = 20,
  signal?: AbortSignal,
  filters: SearchFilters = {},
): Promise<AcademicPaper[]> {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  const exact = identifier(query);
  const q = exact?.kind === 'doi' ? `DOI:"${exact.value}"` : query;
  url.searchParams.set('query', `(${q})` + (filters.yearFrom || filters.yearTo ? ` AND FIRST_PDATE:[${filters.yearFrom || 1800}-01-01 TO ${filters.yearTo || new Date().getFullYear()}-12-31]` : '') + (filters.openAccessOnly ? ' AND OPEN_ACCESS:Y' : ''));
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", String(Math.min(limit, 50)));
  url.searchParams.set("format", "json");


  const res = await providerFetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");

    throw new Error(`Europe PMC HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const json = (await res.json()) as EuropePmcResponse;
  if (json.error) throw new Error(`Europe PMC error: ${json.error}`);

  if (!Array.isArray(json.resultList?.result)) throw new Error("Malformed Europe PMC response");
  const results = json.resultList.result;
  return results.map((r) => mapEuropePmcResult(r));
}

function mapEuropePmcResult(r: EuropePmcResult): AcademicPaper {
  const title = normalizeText(r.title) || "Untitled";
  const abstract = normalizeText(r.abstractText) || "No abstract available.";
  const year = r.pubYear ? parseInt(r.pubYear, 10) || null : null;
  const doi = r.doi ?? null;
  const pmid = r.pmid ?? null;
  const pmcid = r.pmcid ?? null;

  // Build source URL in priority order: PMCID > PMID > DOI
  let sourceUrl: string | null = null;
  if (pmcid) sourceUrl = `https://europepmc.org/article/PMC/${pmcid}`;
  else if (pmid) sourceUrl = `https://europepmc.org/article/MED/${pmid}`;
  else if (doi) sourceUrl = `https://doi.org/${doi}`;

  // PDF link from fullTextUrlList
  const fullTextUrls = r.fullTextUrlList?.fullTextUrl;
  const urlList = Array.isArray(fullTextUrls)
    ? fullTextUrls
    : fullTextUrls
      ? [fullTextUrls]
      : [];
  const pdfLink = urlList.find((u) => u.documentStyle === "pdf")?.url || null;

  // Authors: prefer authorList.author array, fall back to splitting authorString
  let authors: string[] = [];
  if (r.authorList?.author) {
    const arr = Array.isArray(r.authorList.author)
      ? r.authorList.author
      : [r.authorList.author];
    authors = arr
      .map((a) => a.fullName || [a.firstName, a.lastName].filter(Boolean).join(" "))
      .filter(Boolean);
  } else if (r.authorString) {
    authors = r.authorString.split(", ").filter(Boolean);
  }

  // Keywords
  let keywords: string[] = [];
  if (r.keywordList?.keyword) {
    const kwArr = Array.isArray(r.keywordList.keyword)
      ? r.keywordList.keyword
      : [r.keywordList.keyword];
    keywords = kwArr.map((k) => k.toLowerCase());
  }

  // Paper type
  let paperType: string | null = null;
  if (r.pubTypeList?.pubType) {
    const ptArr = Array.isArray(r.pubTypeList.pubType)
      ? r.pubTypeList.pubType
      : [r.pubTypeList.pubType];
    paperType = ptArr[0] || null;
  }

  return {
    id: buildId("europepmc", pmid || pmcid || doi || title.slice(0, 60)),
    title,
    authors,
    abstract,
    year,
    doi,
    identifiers: { doi: doi || undefined, pmid: pmid || undefined, pmcid: pmcid || undefined },
    pdfLink,
    citationCount: r.citedByCount == null ? null : safeNumber(r.citedByCount),
    publisher: r.journalTitle || r.source || "Europe PMC",
    sources: ["Europe PMC"],
    sourceUrls: sourceUrl ? [{ source: "Europe PMC", url: sourceUrl }] : [],
    keywords,
    openAccess: r.isOpenAccess == null ? null : r.isOpenAccess === "Y",
    paperType,
    venue: r.journalTitle || null,
  };
}
