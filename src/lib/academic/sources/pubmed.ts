import { providerFetch } from "../http";
import type { AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId, extractKeywords } from "../utils";

interface PubmedAuthor {
  ForeName?: string;
  LastName?: string;
  CollectiveName?: string;
}

interface PubmedArticleId {
  IdType?: string;
  Value?: string;
}

interface PubmedArticle {
  MedlineCitation?: {
    Article?: {
      ArticleTitle?: string;
      Abstract?: { AbstractText?: string | { "#text"?: string }[] };
      AuthorList?: { Author?: PubmedAuthor | PubmedAuthor[] };
      Journal?: {
        Title?: string;
        JournalIssue?: { PubDate?: { Year?: string | number; MedlineDate?: string } };
      };
      PublicationTypeList?: { PublicationType?: string | string[] };
    };
    KeywordList?: { Keyword?: string | string[] }[];
  };
  PubmedData?: {
    ArticleIdList?: { ArticleId?: PubmedArticleId | PubmedArticleId[] };
  };
}

interface ESearchResponse {
  esearchresult?: {
    idlist?: string[];
    error?: string;
  };
}

/**
 * Search PubMed via the NCBI E-utilities (ESearch + EFetch + ESummary).
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
 */
export async function searchPubmed(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AcademicPaper[]> {
  // Step 1: ESearch to get PMIDs
  const esearchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  esearchUrl.searchParams.set("db", "pubmed");
  esearchUrl.searchParams.set("term", query);
  esearchUrl.searchParams.set("retmax", String(Math.min(limit, 30)));
  esearchUrl.searchParams.set("retmode", "json");
  esearchUrl.searchParams.set("sort", "relevance");

  const esearchRes = await providerFetch(esearchUrl, { signal });
  if (!esearchRes.ok) {
    const text = await esearchRes.text().catch(() => "");
    throw new Error(`PubMed ESearch HTTP ${esearchRes.status}: ${truncate(text, 200)}`);
  }
  const esearchJson = (await esearchRes.json()) as ESearchResponse;
  if (esearchJson.esearchresult?.error) {
    throw new Error(`PubMed ESearch error: ${esearchJson.esearchresult.error}`);
  }
  const ids = esearchJson.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  // Step 2: ESummary to get article metadata
  const esummaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  esummaryUrl.searchParams.set("db", "pubmed");
  esummaryUrl.searchParams.set("id", ids.join(","));
  esummaryUrl.searchParams.set("retmode", "json");

  const esummaryRes = await providerFetch(esummaryUrl, { signal });
  if (!esummaryRes.ok) {
    throw new Error(`PubMed ESummary HTTP ${esummaryRes.status}`);
  }
  type ESummaryEntry = {
    title?: string;
    authors?: { name?: string }[];
    pubdate?: string;
    fulljournalname?: string;
    epubdate?: string;
    uid?: string;
    articleids?: PubmedArticleId[];
  };
  type ESummaryResult = {
    uids?: string[];
  } & Record<string, ESummaryEntry>;

  const esummaryJson = (await esummaryRes.json()) as {
    result?: ESummaryResult;
  };

  const result = esummaryJson.result || {};
  const uids = result.uids || [];
  const articles: AcademicPaper[] = [];

  for (const uid of uids) {
    if (uid === "uids") continue;
    const entry = result[uid] as ESummaryEntry | undefined;
    if (!entry || !entry.title) continue;

    const title = normalizeText(entry.title);
    const abstract = "No abstract available. See full article on PubMed for details.";
    const year = parseYear(entry.pubdate || entry.epubdate);
    const doi = findDoi(entry.articleids);
    const pmid = entry.uid || uid;
    const sourceUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

    articles.push({
      id: buildId("pubmed", pmid),
      title,
      authors: (entry.authors || []).map((a) => a.name || "").filter(Boolean),
      abstract,
      year,
      doi,
      pdfLink: null,
      citationCount: 0,
      publisher: entry.fulljournalname || "PubMed",
      sources: ["PubMed"],
      sourceUrls: [{ source: "PubMed", url: sourceUrl }],
      keywords: [],
      openAccess: false,
      paperType: "Journal Article",
      venue: entry.fulljournalname || null,
    });
  }

  return articles;
}

function parseYear(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

function findDoi(ids?: PubmedArticleId[]): string | null {
  if (!ids) return null;
  const arr = Array.isArray(ids) ? ids : [ids];
  return arr.find((i) => i.IdType === "doi")?.Value || null;
}
