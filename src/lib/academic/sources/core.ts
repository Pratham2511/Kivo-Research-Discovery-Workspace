import { providerFetch } from "../http";
import type { AcademicPaper } from "../types";
import { normalizeText, safeNumber, truncate, buildId, extractKeywords } from "../utils";

interface CoreAuthor {
  name?: string;
}

interface CoreResult {
  id?: number | string;
  title?: string;
  abstract?: string;
  year?: number | string;
  authors?: CoreAuthor[];
  downloadUrl?: string;
  doi?: string;
  publisher?: string;
  citationCount?: number | string;
  topics?: string[];
  types?: string[];
  repository?: { name?: string };
  isOpenAccess?: boolean;
  links?: { type?: string; url?: string }[];
}

interface CoreResponse {
  results?: CoreResult[];
  totalHits?: number;
  error?: string;
}

/**
 * Search CORE's v3 API.
 * CORE requires an API key, but its public search endpoint works without one
 * for a small daily quota — we use the public endpoint and gracefully fail.
 */
export async function searchCore(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AcademicPaper[]> {
  // CORE's v3 search endpoint. Without an API key, rate limits apply.
  const url = new URL("https://api.core.ac.uk/v3/search/works");
  const body = {
    q: query,
    limit: Math.min(limit, 30),
  };

  const res = await providerFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${process.env.CORE_API_KEY || ""}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      // CORE likely requires an API key for this endpoint.
      throw new Error("CORE requires an API key — skipping source.");
    }
    throw new Error(`CORE HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const json = (await res.json()) as CoreResponse;
  if (json.error) throw new Error(`CORE error: ${json.error}`);

  if (!Array.isArray(json.results)) throw new Error("Malformed CORE response");
  const results = json.results;
  return results.map((r) => mapCoreResult(r));
}

function mapCoreResult(r: CoreResult): AcademicPaper {
  const title = normalizeText(r.title) || "Untitled";
  const abstract = normalizeText(r.abstract) || "No abstract available.";
  const doi = r.doi ?? null;
  const year = typeof r.year === "number" ? r.year : r.year ? parseInt(String(r.year), 10) || null : null;
  const sourceUrl = r.id ? `https://core.ac.uk/works/${r.id}` : null;
  const pdfLink = r.downloadUrl ||
    r.links?.find((l) => l.type === "pdf")?.url ||
    null;

  return {
    id: buildId("core", r.id || doi || title.slice(0, 60)),
    title,
    authors: (r.authors || []).map((a) => a.name || "").filter(Boolean),
    abstract,
    year,
    doi,
    pdfLink,
    citationCount: r.citationCount == null ? null : safeNumber(r.citationCount),
    publisher: r.publisher || r.repository?.name || null,
    sources: ["CORE"],
    sourceUrls: sourceUrl ? [{ source: "CORE", url: sourceUrl }] : [],
    keywords: (r.topics || []).slice(0, 8).map((s) => s.toLowerCase()),
    openAccess: r.isOpenAccess ?? null,
    paperType: r.types?.[0] ?? null,
    venue: r.repository?.name || null,
  };
}
