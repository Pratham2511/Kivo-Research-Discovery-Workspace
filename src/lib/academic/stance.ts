/**
 * Smart-citation stance classification — supporting / contrasting / mentioning.
 *
 * Design contract (see FUTURE_FEATURES.md #6): the classifier is a fully
 * transparent, auditable heuristic — no black box. The rule list is exported
 * and rendered in the UI so a student can cite *how* the classification was
 * made in a methods section. This mirrors scite.ai's smart-citation taxonomy
 * (Nicholson et al., 2021) at the heuristic baseline level.
 *
 * Precedence is deliberate: a contrast marker anywhere in the context wins
 * over a support marker, because skeptical readings ("consistent with X,
 * however…") are the ones a student must not miss.
 */

export type Stance = "supporting" | "contrasting" | "mentioning";

/** Human-readable rule groups — rendered verbatim in the UI disclosure. */
export const STANCE_LEXICON: Record<
  "contrasting" | "supporting",
  string[]
> = {
  contrasting: [
    "however",
    "in contrast",
    "contrary to",
    "contradict",
    "conflict",
    "inconsistent with",
    "fails to",
    "failed to",
    "fail to",
    "does not",
    "do not",
    "did not",
    "unable to reproduce",
    "could not reproduce",
    "refute",
    "dispute",
    "question the",
    "questions the",
    "challenge",
    "overestimat",
    "underestimat",
    "limitation",
    "flaw",
    "criticiz",
    "at odds with",
    "unlike",
    "whereas",
    "rebut",
    "disagree",
    "debunk",
  ],
  supporting: [
    "consistent with",
    "consistent",
    "in line with",
    "in agreement",
    "agrees with",
    "agree with",
    "in accordance",
    "confirm",
    "corroborat",
    "support",
    "validate",
    "verif",
    "reproduc",
    "replicat",
    "as reported by",
    "as shown by",
    "as demonstrated by",
    "as observed by",
    "aligns with",
    "aligned with",
    "matches",
  ],
};

type Rule = { pattern: RegExp; stance: Exclude<Stance, "mentioning">; term: string };

function compile(stance: "contrasting" | "supporting"): Rule[] {
  return STANCE_LEXICON[stance].map((term) => ({
    term,
    stance,
    // Word-ish boundaries: no letters immediately before/after the term, so
    // "confirm" matches "confirmed" (prefix families) but not "disconfirm"…
    // except "does not" style phrases rely on the leading boundary only.
    pattern: new RegExp(
      `(?<![a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    ),
  }));
}

const CONTRAST_RULES = compile("contrasting");
const SUPPORT_RULES = compile("supporting");

/** Which concrete term triggered the classification (for the UI receipt). */
export interface StanceVerdict {
  stance: Stance;
  matchedTerm: string | null;
}

export function classifyStance(context: string): StanceVerdict {
  for (const rule of CONTRAST_RULES) {
    if (rule.pattern.test(context)) {
      return { stance: "contrasting", matchedTerm: rule.term };
    }
  }
  for (const rule of SUPPORT_RULES) {
    if (rule.pattern.test(context)) {
      return { stance: "supporting", matchedTerm: rule.term };
    }
  }
  return { stance: "mentioning", matchedTerm: null };
}

export interface StanceTally {
  supporting: number;
  contrasting: number;
  mentioning: number;
}

export function tallyStances(contexts: string[]): StanceTally {
  const tally: StanceTally = { supporting: 0, contrasting: 0, mentioning: 0 };
  for (const c of contexts) tally[classifyStance(c).stance]++;
  return tally;
}
