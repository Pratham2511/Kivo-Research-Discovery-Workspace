import type { Claim, ClaimStance, Evidence, Workspace } from "./schema";

/**
 * Pure argument-synthesis helpers for the Builder (FUTURE_FEATURES #10).
 *
 * The Toulmin contract: a claim is only as strong as the receipts attached
 * to it. These functions never mutate state — they derive status, coverage
 * warnings, and exportable prose from the claims + evidence already stored.
 */

export type ClaimStatus = "unbacked" | "supported" | "contested" | "qualified";

export const STANCE_LABELS: Record<ClaimStance, string> = {
  support: "supports",
  qualify: "qualifies",
  contradict: "contradicts",
};

export const STANCE_TICKETS: Record<ClaimStance, string> = {
  support: "ticket-green",
  qualify: "ticket-yellow",
  contradict: "ticket-red",
};

/** Verb used for a stance when writing prose ("X **supports** this claim"). */
const STANCE_VERBS: Record<ClaimStance, string> = {
  support: "supports",
  qualify: "qualifies the scope of",
  contradict: "pushes against",
};

/**
 * Derive a claim's standing from its attachments:
 * - unbacked  — nothing attached yet
 * - contested — at least one contradicting receipt (regardless of support)
 * - supported — at least one supporting receipt, no contradictions
 * - qualified — only bounding receipts so far
 */
export function claimStatus(claim: Claim): ClaimStatus {
  if (claim.evidence.length === 0) return "unbacked";
  const stances = new Set(claim.evidence.map((link) => link.stance));
  if (stances.has("contradict")) return "contested";
  if (stances.has("support")) return "supported";
  return "qualified";
}

export function stanceTally(claim: Claim): Record<ClaimStance, number> {
  const tally: Record<ClaimStance, number> = { support: 0, qualify: 0, contradict: 0 };
  for (const link of claim.evidence) tally[link.stance] += 1;
  return tally;
}

export interface CoverageIssue {
  claimId: string;
  claimIndex: number;
  text: string;
  status: ClaimStatus;
  message: string;
}

/**
 * The honest report: what a supervisor would circle in red before the
 * outline goes anywhere. Empty list = every claim has at least one clean
 * supporting receipt and no unaddressed contradictions.
 */
export function coverageReport(claims: Claim[]): CoverageIssue[] {
  const issues: CoverageIssue[] = [];
  claims.forEach((claim, i) => {
    const status = claimStatus(claim);
    if (status === "unbacked") {
      issues.push({
        claimId: claim.id,
        claimIndex: i + 1,
        text: claim.text,
        status,
        message: "No evidence attached — this claim is currently an assertion.",
      });
    } else if (status === "contested") {
      const tally = stanceTally(claim);
      issues.push({
        claimId: claim.id,
        claimIndex: i + 1,
        text: claim.text,
        status,
        message: `${tally.contradict} contradicting ${tally.contradict === 1 ? "receipt" : "receipts"} — address, bound, or rework the claim.`,
      });
    } else if (status === "qualified") {
      issues.push({
        claimId: claim.id,
        claimIndex: i + 1,
        text: claim.text,
        status,
        message: "Only bounding evidence so far — nothing squarely supports it yet.",
      });
  }
  });
  return issues;
}

/** Share of claims with at least one supporting, non-contradicted receipt. */
export function coverageScore(claims: Claim[]): number {
  if (claims.length === 0) return 0;
  const backed = claims.filter((c) => claimStatus(c) === "supported").length;
  return backed / claims.length;
}

function citationFor(paper: Workspace["papers"][number] | undefined, evidence: Evidence): string {
  if (!paper) return "unknown source";
  const authors = paper.authors.length > 0 ? paper.authors[0].split(" ").slice(-1)[0] : "Unknown";
  const year = paper.year ?? "n.d.";
  const anchor = evidence.page ? `, p. ${evidence.page}` : "";
  const doi = paper.doi ? ` — https://doi.org/${paper.doi}` : "";
  return `${authors} (${year})${anchor} · “${paper.title}”${doi}`;
}

/**
 * Build the Markdown outline: claim → supporting prose with verbatim
 * receipts quoted inline. Contradictions are included too — an honest
 * lit review names its friction, and each item lands with its citation.
 */
export function buildOutline(
  state: Pick<Workspace, "evidence" | "papers">,
  claims: Claim[],
): string {
  if (claims.length === 0) return "# Argument outline\n\nNo claims yet.";

  const lines: string[] = [
    "# Argument outline",
    "",
    `_Generated ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · KIVO The Evidence Desk · ${claims.length} ${claims.length === 1 ? "claim" : "claims"} · ${state.evidence.length} evidence ${state.evidence.length === 1 ? "receipt" : "receipts"}_`,
    "",
  ];

  claims.forEach((claim, i) => {
    const status = claimStatus(claim);
    lines.push(`## Claim ${i + 1} — ${claim.text.trim()}`);
    lines.push("");
    if (status === "unbacked") {
      lines.push("> ⚠️ No evidence attached yet — this claim is an assertion until receipts land.");
      lines.push("");
      return;
    }
    const order: ClaimStance[] = ["support", "qualify", "contradict"];
    for (const stance of order) {
      const links = claim.evidence.filter((l) => l.stance === stance);
      if (links.length === 0) continue;
      lines.push(`**${STANCE_VERBS[stance]} this claim** (${links.length}):`);
      lines.push("");
      for (const link of links) {
        const evidence = state.evidence.find((e) => e.id === link.evidenceId);
        if (!evidence) continue;
        const paper = state.papers.find((p) => p.id === evidence.paperId);
        lines.push(`> “${evidence.statement.trim()}”`);
        lines.push(`> — ${citationFor(paper, evidence)}`);
        if (link.note.trim()) lines.push(`>`);
        if (link.note.trim()) lines.push(`> _Your note: ${link.note.trim()}_`);
        lines.push("");
      }
    }
  });

  const issues = coverageReport(claims);
  lines.push("---", "", "## Coverage report", "");
  if (issues.length === 0) {
    lines.push("Every claim has at least one supporting receipt and no unaddressed contradictions.");
  } else {
    for (const issue of issues) {
      lines.push(`- **Claim ${issue.claimIndex}:** ${issue.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
