/**
 * Seminar Mode (FUTURE_FEATURES #9) — shared screening & peer agreement.
 *
 * The professional blind dual-screening workflow (Covidence) and the social
 * annotation pedagogy (hypothes.is, CERIC), delivered in a local-first way:
 * bundles are JSON files that travel by email or the LMS, never via a
 * server. KIVO only ever computes over what the user can see.
 *
 * Flow:
 *   1. Student A exports "my screening" for a project — a bundle file with
 *      the project brief, the member papers (metadata only) and A's own
 *      decisions so far.
 *   2. Student B imports the bundle: KIVO builds a blind seminar project
 *      (papers queued, decisions wiped — A's judgements are never shown).
 *   3. B screens, exports their bundle back.
 *   4. A imports B's bundle against the live project → this module computes
 *      Cohen's κ over the papers both screened, plus a per-paper reason
 *      diff view for the seminar discussion.
 */

import { z } from "zod";
import type { Project, Workspace } from "./schema";

export type Decision = "unscreened" | "include" | "exclude" | "maybe";

export const SEMINAR_KIND = "kivo-seminar-bundle/v1";

const bundlePaperSchema = z.object({
  paperId: z.string().max(500),
  title: z.string().max(1000),
  firstAuthor: z.string().max(300).nullable(),
  year: z.number().int().nullable(),
  doi: z.string().max(500).nullable(),
  venue: z.string().max(1000).nullable(),
});

const bundleDecisionSchema = z.object({
  decision: z.enum(["include", "exclude", "maybe", "unscreened"]),
  reason: z.string().max(4000).default(""),
});

export const seminarBundleSchema = z.object({
  kind: z.literal(SEMINAR_KIND),
  projectId: z.string().max(100),
  projectName: z.string().max(200),
  question: z.string().max(16000),
  criteria: z.string().max(16000),
  exportedBy: z.string().min(1).max(120),
  exportedAt: z.string(),
  papers: z.array(bundlePaperSchema).max(2000),
  decisions: z.record(z.string(), bundleDecisionSchema),
});
export type SeminarBundle = z.infer<typeof seminarBundleSchema>;

/** Build a bundle from a live project (the exporter's own screening). */
export function exportSeminarBundle(
  project: Project,
  workspace: Pick<Workspace, "papers">,
  reviewer: string,
): SeminarBundle {
  return {
    kind: SEMINAR_KIND,
    projectId: project.id,
    projectName: project.name,
    question: project.question,
    criteria: project.criteria,
    exportedBy: reviewer.trim() || "anonymous reviewer",
    exportedAt: new Date().toISOString(),
    papers: project.members.map((m) => {
      const p = workspace.papers.find((x) => x.id === m.paperId);
      return {
        paperId: m.paperId,
        title: p?.title ?? "(record no longer in this workspace)",
        firstAuthor: p?.authors?.[0] ?? null,
        year: p?.year ?? null,
        doi: p?.doi ?? null,
        venue: p?.venue ?? null,
      };
    }),
    decisions: Object.fromEntries(
      project.members
        .filter((m) => m.decision !== "unscreened")
        .map((m) => [m.paperId, { decision: m.decision, reason: m.reason }]),
    ),
  };
}

/* ── Cohen's κ ───────────────────────────────────────────────────────────── */

export interface KappaStats {
  kappa: number | null;
  /** Raw agreement share over co-screened papers (0-1). */
  observed: number;
  /** Chance-expected agreement share (0-1). */
  expected: number;
  n: number;
  /** Decision counts per rater over co-screened papers. */
  mine: Record<Exclude<Decision, "unscreened">, number>;
  theirs: Record<Exclude<Decision, "unscreened">, number>;
  /** Landis & Koch (1977) interpretation band label. */
  band: string;
}

const LANDIS_KOCH: Array<[number, string]> = [
  [0.81, "almost perfect"],
  [0.61, "substantial"],
  [0.41, "moderate"],
  [0.21, "fair"],
  [0.0, "slight"],
  [-Infinity, "poor"],
];

export function kappaBand(kappa: number): string {
  for (const [threshold, label] of LANDIS_KOCH) {
    if (kappa >= threshold) return label;
  }
  return "poor";
}

/**
 * Cohen's κ over co-screened decision pairs. Unscreened on either side is
 * excluded (κ is defined over categories both raters actually used).
 * Returns kappa: null when undefined (no co-screened papers, or both raters
 * concentrated 100% in one category — κ's denominator collapses).
 */
export function cohenKappa(
  pairs: Array<{ mine: Exclude<Decision, "unscreened">; theirs: Exclude<Decision, "unscreened"> }>,
): KappaStats {
  const categories: Exclude<Decision, "unscreened">[] = ["include", "exclude", "maybe"];
  const n = pairs.length;
  const zero = { include: 0, exclude: 0, maybe: 0 } as const;
  const mine = { ...zero };
  const theirs = { ...zero };
  let agree = 0;
  for (const p of pairs) {
    mine[p.mine] += 1;
    theirs[p.theirs] += 1;
    if (p.mine === p.theirs) agree += 1;
  }
  const observed = n > 0 ? agree / n : 0;
  const expected =
    n > 0
      ? categories.reduce(
          (sum, c) => sum + (mine[c] / n) * (theirs[c] / n),
          0,
        )
      : 0;
  let kappa: number | null = null;
  if (n > 0 && expected < 1) {
    kappa = Math.round(((observed - expected) / (1 - expected)) * 1000) / 1000;
  } else if (n > 0 && expected === 1 && observed === 1) {
    // Both raters put every paper in the same single category.
    kappa = 1;
  }
  return {
    kappa,
    observed,
    expected,
    n,
    mine,
    theirs,
    band: kappa === null ? "undefined" : kappaBand(kappa),
  };
}

/* ── Disagreement report ─────────────────────────────────────────────────── */

export interface KappaRow {
  paperId: string;
  title: string;
  mine: Decision;
  theirs: Decision;
  agree: boolean;
  myReason: string;
  theirReason: string;
}

export interface KappaReport {
  bundle: SeminarBundle;
  stats: KappaStats;
  /** Co-screened rows, disagreements first, then title order. */
  rows: KappaRow[];
  disagreements: KappaRow[];
  agreements: KappaRow[];
  /** Papers only the peer screened (theirs ≠ unscreened, mine = unscreened). */
  onlyTheirs: Array<{ paperId: string; title: string; theirs: Decision; theirReason: string }>;
  /** Papers only I screened (mine ≠ unscreened, theirs = unscreened). */
  onlyMine: Array<{ paperId: string; title: string; mine: Decision; myReason: string }>;
  /** Papers with decisions in the bundle that are not members of my project
   *   at all (the peer added papers I never queued). */
  notInMine: Array<{ paperId: string; title: string; theirs: Decision; theirReason: string }>;
}

/** Diff a peer's returned bundle against a live project. */
export function buildKappaReport(
  project: Project,
  bundle: SeminarBundle,
  workspace: Pick<Workspace, "papers">,
): KappaReport {
  const titleFor = (paperId: string) =>
    bundle.papers.find((p) => p.paperId === paperId)?.title ??
    workspace.papers.find((p) => p.id === paperId)?.title ??
    "(unknown record)";

  const memberById = new Map(project.members.map((m) => [m.paperId, m]));
  const rows: KappaRow[] = [];
  const onlyTheirs: KappaReport["onlyTheirs"] = [];
  const onlyMine: KappaReport["onlyMine"] = [];

  for (const m of project.members) {
    const theirs = bundle.decisions[m.paperId];
    if (!theirs) continue; // not in the peer's bundle
    if (m.decision !== "unscreened" && theirs.decision !== "unscreened") {
      rows.push({
        paperId: m.paperId,
        title: titleFor(m.paperId),
        mine: m.decision,
        theirs: theirs.decision,
        agree: m.decision === theirs.decision,
        myReason: m.reason,
        theirReason: theirs.reason,
      });
    } else if (m.decision === "unscreened" && theirs.decision !== "unscreened") {
      onlyTheirs.push({
        paperId: m.paperId,
        title: titleFor(m.paperId),
        theirs: theirs.decision,
        theirReason: theirs.reason,
      });
    } else if (m.decision !== "unscreened" && theirs.decision === "unscreened") {
      onlyMine.push({
        paperId: m.paperId,
        title: titleFor(m.paperId),
        mine: m.decision,
        myReason: m.reason,
      });
    }
  }

  // Bundle papers my project never queued — the peer added them; surface
  // them honestly instead of silently ignoring them.
  const notInMine: KappaReport["notInMine"] = [];
  for (const [paperId, dec] of Object.entries(bundle.decisions)) {
    if (dec.decision === "unscreened") continue;
    if (memberById.has(paperId)) continue;
    notInMine.push({
      paperId,
      title: titleFor(paperId),
      theirs: dec.decision,
      theirReason: dec.reason,
    });
  }

  const stats = cohenKappa(
    rows.map((r) => ({
      mine: r.mine as Exclude<Decision, "unscreened">,
      theirs: r.theirs as Exclude<Decision, "unscreened">,
    })),
  );

  const disagreements = rows.filter((r) => !r.agree);
  const agreements = rows.filter((r) => r.agree);

  return { bundle, stats, rows, disagreements, agreements, onlyTheirs, onlyMine, notInMine };
}

/** Render a report as Markdown for the seminar minutes. */
export function kappaMarkdown(report: KappaReport, myName: string): string {
  const { stats, bundle } = report;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const lines: string[] = [
    `# Screening agreement — ${bundle.projectName}`,
    "",
    `- Reviewers: **${myName}** vs **${bundle.exportedBy}** (bundle exported ${new Date(bundle.exportedAt).toLocaleString()})`,
    `- Co-screened papers: **${stats.n}**`,
    stats.kappa === null
      ? `- Cohen's κ: **undefined** (too few co-screened papers, or every co-screened paper sits in one category)`
      : `- Cohen's κ: **${stats.kappa.toFixed(2)}** (${stats.band} — Landis & Koch 1977)`,
    `- Raw agreement: **${pct(stats.observed)}** (chance-expected: ${pct(stats.expected)})`,
    `- Decisions — mine: ${stats.mine.include} inc / ${stats.mine.exclude} exc / ${stats.mine.maybe} maybe · theirs: ${stats.theirs.include} inc / ${stats.theirs.exclude} exc / ${stats.theirs.maybe} maybe`,
    "",
  ];
  if (report.disagreements.length > 0) {
    lines.push(`## Disagreements (${report.disagreements.length})`, "");
    for (const d of report.disagreements) {
      lines.push(
        `### ${d.title}`,
        `- Me: **${d.mine}** — ${d.myReason || "_(no reason recorded)_"}`,
        `- ${bundle.exportedBy}: **${d.theirs}** — ${d.theirReason || "_(no reason recorded)_"}`,
        "",
      );
    }
  }
  if (report.onlyTheirs.length > 0) {
    lines.push(
      `## Screened only by ${bundle.exportedBy} (${report.onlyTheirs.length})`,
      "",
      ...report.onlyTheirs.map((r) => `- ${r.title} — **${r.theirs}**`),
      "",
    );
  }
  if (report.onlyMine.length > 0) {
    lines.push(
      `## Screened only by me (${report.onlyMine.length})`,
      "",
      ...report.onlyMine.map((r) => `- ${r.title} — **${r.mine}**`),
      "",
    );
  }
  if (report.notInMine.length > 0) {
    lines.push(
      `## In their bundle, not queued in my project (${report.notInMine.length})`,
      "",
      ...report.notInMine.map((r) => `- ${r.title} — **${r.theirs}**`),
      "",
    );
  }
  lines.push(
    "---",
    "κ corrects for chance agreement — with lopsided decisions, high raw agreement can still yield a low κ (the Feinstein & Cicchetti, 1990 paradox).",
    "Computed locally by KIVO · The Evidence Desk.",
  );
  return lines.join("\n");
}

/* ── Blind import ────────────────────────────────────────────────────────── */

export interface BlindImport {
  name: string;
  question: string;
  criteria: string;
  /** Papers to add to the workspace (id + minimal metadata). */
  papers: Array<{
    paperId: string;
    title: string;
    firstAuthor: string | null;
    year: number | null;
    doi: string | null;
    venue: string | null;
  }>;
}

/** Shape the blind seminar project to create from an imported bundle. */
export function blindProjectFromBundle(bundle: SeminarBundle): BlindImport {
  return {
    name: `Seminar · ${bundle.projectName} (by ${bundle.exportedBy})`,
    question: bundle.question,
    criteria: bundle.criteria,
    papers: bundle.papers.map((p) => ({ ...p })),
  };
}
