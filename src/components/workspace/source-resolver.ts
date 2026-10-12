import type { Workspace } from "@/lib/workspace/schema";

export type Paper = Workspace["papers"][number];
export interface PaperAccessOption {
  type: "direct_pdf" | "source_doi" | "provider_page" | "open_access";
  label: string;
  url: string;
  isDirectPdf: boolean;
  sourceName?: string;
}
export interface PaperAccessResolution {
  hasAccess: boolean;
  primaryAction: PaperAccessOption | null;
  secondaryActions: PaperAccessOption[];
  hasDirectPdf: boolean;
  directPdfUrl: string | null;
  doiUrl: string | null;
  accessBadge: { label: string; variant: "emerald" | "iris" | "slate"; tooltip: string };
}

/** Ignore malformed/non-web metadata instead of rendering broken or unsafe links. */
export function safePaperUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (["arxiv.org", "www.arxiv.org", "doi.org", "dx.doi.org"].includes(url.hostname)) url.protocol = "https:";
    return url.href;
  } catch { return null; }
}

export function resolvePaperAccess(paper: Paper): PaperAccessResolution {
  const options: PaperAccessOption[] = [];
  const add = (option: PaperAccessOption) => {
    if (!options.some(existing => existing.url === option.url)) options.push(option);
  };
  const pdf = safePaperUrl(paper.pdfLink);
  if (pdf) add({ type: "direct_pdf", label: "View PDF", url: pdf, isDirectPdf: true, sourceName: "PDF" });
  for (const source of paper.sourceUrls ?? []) {
    const url = safePaperUrl(source.url);
    if (!url) continue;
    const path = new URL(url).pathname;
    const isPdf = /\.pdf$/i.test(path) || /\/pdf\//i.test(path);
    add({ type: isPdf ? "direct_pdf" : "provider_page", label: isPdf ? "PDF (" + source.source + ")" : "Source (" + source.source + ")", url, isDirectPdf: isPdf, sourceName: source.source });
  }
  const cleanDoi = paper.doi?.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  const doiUrl = cleanDoi && /^10\.\d{4,9}\/\S+$/i.test(cleanDoi)
    ? "https://doi.org/" + cleanDoi.split("/").map(encodeURIComponent).join("/") : null;
  if (doiUrl) add({ type: "source_doi", label: "View source (DOI)", url: doiUrl, isDirectPdf: false, sourceName: "DOI" });
  const arxiv = paper.identifiers?.arxiv?.trim().replace(/^arxiv:\s*/i, "").replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, "").replace(/\.pdf$/i, "");
  if (arxiv && /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/.test(arxiv)) {
    add({ type: "direct_pdf", label: "arXiv PDF", url: "https://arxiv.org/pdf/" + arxiv, isDirectPdf: true, sourceName: "arXiv" });
  }
  const pmcid = paper.identifiers?.pmcid;
  if (pmcid && /^PMC\d+$/i.test(pmcid)) {
    add({ type: "open_access", label: "PubMed Central", url: "https://pmc.ncbi.nlm.nih.gov/articles/" + pmcid + "/", isDirectPdf: false, sourceName: "PMC" });
  }

  const primaryAction = options.find(option => option.isDirectPdf) ?? options[0] ?? null;
  const directPdfUrl = options.find(option => option.isDirectPdf)?.url ?? null;
  const accessBadge: PaperAccessResolution["accessBadge"] = directPdfUrl
    ? { label: "PDF LINK", variant: "emerald", tooltip: "The source supplies a full-text PDF link. Access depends on the publisher or repository." }
    : paper.openAccess
      ? { label: "OPEN ACCESS", variant: "emerald", tooltip: "Open access article or repository landing page." }
      : options.length
        ? { label: "SOURCE RECORD", variant: "iris", tooltip: "Official source page. A downloadable PDF is not confirmed." }
        : { label: "METADATA RECORD", variant: "slate", tooltip: "No valid source link was supplied with this record." };
  return { hasAccess: options.length > 0, primaryAction, secondaryActions: options.filter(option => option !== primaryAction),
    hasDirectPdf: !!directPdfUrl, directPdfUrl, doiUrl, accessBadge };
}
