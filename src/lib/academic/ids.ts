import type { Paper } from "@/components/workspace/paper-card";

/**
 * Ordered Semantic Scholar query candidates for a workspace Paper.
 *
 * S2 accepts several identifier namespaces; some papers (arXiv preprints,
 * PubMed records) carry a resolvable id while their proceedings DOI is a
 * placeholder (10.5555/…) that S2 never indexed. The order below prefers the
 * identifiers most likely to resolve.
 */
export function toS2IdCandidates(paper: Paper): string[] {
  const ids = paper.identifiers;
  const out: string[] = [];
  if (ids?.semanticScholar && /^[0-9a-fA-F]{40}$/.test(ids.semanticScholar))
    out.push(ids.semanticScholar);
  if (ids?.arxiv) out.push(`ARXIV:${ids.arxiv}`);
  // ArXiv-sourced records also carry their id in the workspace id itself.
  if (/^arxiv:/i.test(paper.id)) out.push(`ARXIV:${paper.id.slice(6)}`);
  const doi = ids?.doi || paper.doi;
  if (doi && /^10\./i.test(doi)) out.push(`DOI:${doi}`);
  if (ids?.pmid) out.push(`PMID:${ids.pmid}`);
  return [...new Set(out)];
}
