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
  accessBadge: {
    label: string;
    variant: "emerald" | "iris" | "slate";
    tooltip: string;
  };
}

/**
 * Resolves legitimate access pathways (direct PDF, DOI, open-access, provider source)
 * from paper metadata without requiring any manual PDF upload.
 */
export function resolvePaperAccess(paper: Paper): PaperAccessResolution {
  const options: PaperAccessOption[] = [];
  let directPdfUrl: string | null = null;
  let doiUrl: string | null = null;

  // 1. Check direct pdfLink
  if (paper.pdfLink && /^https?:\/\//i.test(paper.pdfLink)) {
    directPdfUrl = paper.pdfLink;
    options.push({
      type: "direct_pdf",
      label: "View PDF",
      url: paper.pdfLink,
      isDirectPdf: true,
      sourceName: "Direct PDF",
    });
  }

  // 2. Check sourceUrls for PDF links or repository landings
  if (Array.isArray(paper.sourceUrls)) {
    for (const item of paper.sourceUrls) {
      if (!item.url || !/^https?:\/\//i.test(item.url)) continue;

      const isPdf = /\.pdf(\?|$)/i.test(item.url) || item.url.includes("/pdf/");
      if (isPdf && !directPdfUrl) {
        directPdfUrl = item.url;
        options.push({
          type: "direct_pdf",
          label: `PDF (${item.source})`,
          url: item.url,
          isDirectPdf: true,
          sourceName: item.source,
        });
      } else if (!options.some((o) => o.url === item.url)) {
        options.push({
          type: "provider_page",
          label: `Source (${item.source})`,
          url: item.url,
          isDirectPdf: false,
          sourceName: item.source,
        });
      }
    }
  }

  // 3. Check DOI
  if (paper.doi) {
    const cleanDoi = paper.doi.replace(/^doi:\s*/i, "").trim();
    doiUrl = cleanDoi.startsWith("http") ? cleanDoi : `https://doi.org/${cleanDoi}`;
    if (!options.some((o) => o.url === doiUrl)) {
      options.push({
        type: "source_doi",
        label: "View at Source (DOI)",
        url: doiUrl,
        isDirectPdf: false,
        sourceName: "DOI",
      });
    }
  }

  // 4. Check identifiers
  if (paper.identifiers) {
    if (paper.identifiers.arxiv) {
      const arxivId = paper.identifiers.arxiv.replace(/^arxiv:\s*/i, "").trim();
      const arxivPdf = `https://arxiv.org/pdf/${arxivId}.pdf`;
      if (!directPdfUrl) directPdfUrl = arxivPdf;
      if (!options.some((o) => o.url === arxivPdf)) {
        options.push({
          type: "direct_pdf",
          label: "arXiv PDF",
          url: arxivPdf,
          isDirectPdf: true,
          sourceName: "arXiv",
        });
      }
    }
    if (paper.identifiers.pmcid && !directPdfUrl) {
      const pmcUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${paper.identifiers.pmcid}/`;
      if (!options.some((o) => o.url === pmcUrl)) {
        options.push({
          type: "open_access",
          label: "PubMed Central",
          url: pmcUrl,
          isDirectPdf: false,
          sourceName: "PMC",
        });
      }
    }
  }

  // Determine primary and secondary actions
  const primary = options.find((o) => o.isDirectPdf) || options[0] || null;
  const secondary = options.filter((o) => o !== primary);

  // Determine access badge
  let accessBadge: PaperAccessResolution["accessBadge"] = {
    label: "METADATA RECORD",
    variant: "slate",
    tooltip: "Index record with abstract and metadata only",
  };

  if (directPdfUrl) {
    accessBadge = {
      label: "DIRECT PDF",
      variant: "emerald",
      tooltip: "Full-text PDF is immediately accessible from the primary source",
    };
  } else if (paper.openAccess) {
    accessBadge = {
      label: "OPEN ACCESS",
      variant: "emerald",
      tooltip: "Open access repository or journal article landing page",
    };
  } else if (doiUrl || options.length > 0) {
    accessBadge = {
      label: "SOURCE RECORD",
      variant: "iris",
      tooltip: "Publisher page or official repository link available",
    };
  }

  return {
    hasAccess: options.length > 0,
    primaryAction: primary,
    secondaryActions: secondary,
    hasDirectPdf: Boolean(directPdfUrl),
    directPdfUrl,
    doiUrl,
    accessBadge,
  };
}
