import type { AcademicPaper } from "./types";
import { titleKey } from "./utils";
const doiKey = (value: string | null) =>
  value
    ?.toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi.org\//, "")
    .trim() || null;
export function deduplicatePapers(input: AcademicPaper[]): {
  papers: AcademicPaper[];
  duplicatesRemoved: number;
} {
  const output: AcademicPaper[] = [];
  for (const raw of [...input].sort((a, b) => a.id.localeCompare(b.id))) {
    const p = structuredClone(raw);
    p.doi = doiKey(p.doi);
    const existing = output.find((e) => {
      if ((e.paperType === "preprint") !== (p.paperType === "preprint"))
        return false;
      if (e.doi && p.doi) return e.doi === p.doi;
      if (e.identifiers?.arxiv && p.identifiers?.arxiv)
        return e.identifiers.arxiv === p.identifiers.arxiv;
      return (
        titleKey(e.title).length > 20 &&
        titleKey(e.title) === titleKey(p.title) &&
        e.year != null &&
        e.year === p.year &&
        !!e.authors[0] &&
        titleKey(e.authors[0]) === titleKey(p.authors[0])
      );
    });
    if (!existing) {
      output.push(p);
      continue;
    }
    existing.integrityNotices = [...(existing.integrityNotices || []), ...(p.integrityNotices || [])];
    existing.doi ||= p.doi;
    existing.identifiers = { ...p.identifiers, ...existing.identifiers };
    existing.sources = [...new Set([...existing.sources, ...p.sources])];
    existing.sourceUrls = [
      ...new Map(
        [...existing.sourceUrls, ...p.sourceUrls].map((u) => [u.url, u]),
      ).values(),
    ];
    existing.provenance = [
      ...(existing.provenance || []),
      ...(p.provenance || []),
    ];
    if (p.abstract.length > existing.abstract.length)
      existing.abstract = p.abstract;
    if (p.citationCount != null)
      existing.citationCount = Math.max(
        existing.citationCount ?? 0,
        p.citationCount,
      );
    existing.pdfLink ||= p.pdfLink;
    existing.venue ||= p.venue;
    existing.publisher ||= p.publisher;
    if (p.openAccess === true || existing.openAccess == null)
      existing.openAccess = p.openAccess;
    existing.keywords = [...new Set([...existing.keywords, ...p.keywords])];
  }
  for (const p of output)
    p.id =
      p.paperType === "preprint"
        ? p.identifiers?.arxiv
          ? `arxiv:${p.identifiers.arxiv}`
          : p.id
        : p.doi
          ? `doi:${p.doi}`
          : p.id;
  return { papers: output, duplicatesRemoved: input.length - output.length };
}
