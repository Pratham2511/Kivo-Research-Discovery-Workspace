/**
 * Flesch–Kincaid readability for research abstracts (FUTURE_FEATURES #11).
 *
 * Pure heuristics, computed entirely client-side — no model involved in the
 * score itself. The syllable counter is the standard vowel-group heuristic;
 * it is honest about being an estimate and the UI discloses the formula.
 */

const VOWELS = "aeiouy";

/** Standard vowel-group syllable heuristic (never returns 0). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let count = 0;
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = VOWELS.includes(ch);
    if (isVowel && !prevVowel) count += 1;
    prevVowel = isVowel;
  }
  // Silent trailing e ("state", "module") — heuristic, not law.
  if (w.endsWith("le") || w.endsWith("ee") || w.endsWith("ye")) {
    /* keep count */
  } else if (w.endsWith("e") && count > 1) {
    count -= 1;
  }
  return Math.max(1, count);
}

export interface ReadabilityStats {
  /** Flesch–Kincaid grade level (US school grade; 16 ≈ college senior). */
  grade: number;
  words: number;
  sentences: number;
  syllables: number;
  /** Average words per sentence. */
  avgSentence: number;
}

/** FK grade over a block of text. */
export function readability(text: string): ReadabilityStats {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { grade: 0, words: 0, sentences: 0, syllables: 0, avgSentence: 0 };
  const sentences = Math.max(
    1,
    (clean.match(/[.!?]+(?=\s|$)/g) || []).length || 1,
  );
  const wordList = clean.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const words = wordList.length;
  const syllables = wordList.reduce((sum, w) => sum + countSyllables(w), 0);
  if (words === 0) return { grade: 0, words: 0, sentences: 0, syllables: 0, avgSentence: 0 };
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return {
    grade: Math.max(1, Math.round(grade * 10) / 10),
    words,
    sentences,
    syllables,
    avgSentence: Math.round((words / sentences) * 10) / 10,
  };
}

export interface ReadingLevel {
  label: string;
  blurb: string;
}

/** Map an FK grade onto a student-facing reading level. */
export function readingLevel(grade: number): ReadingLevel {
  if (grade <= 10)
    return {
      label: "Undergraduate-friendly",
      blurb: "Plain prose for the field — a first-year can follow most of it.",
    };
  if (grade <= 13)
    return {
      label: "Advanced undergraduate",
      blurb: "Dense sentences; gloss the jargon and it reads fine.",
    };
  if (grade <= 16)
    return {
      label: "Graduate entry",
      blurb: "Assumes coursework comfort. The heatmap earns its keep here.",
    };
  if (grade <= 20)
    return {
      label: "Graduate research",
      blurb: "Specialist prose — long sentences plus heavy terminology.",
    };
  return {
    label: "Dense — specialist",
    blurb: "Even the field's own grad students skim this twice.",
  };
}

export type JargonDensityBand = "light" | "moderate" | "heavy" | "very-heavy";

export function jargonDensityBand(
  jargonHits: number,
  words: number,
): { band: JargonDensityBand; per100: number; label: string } {
  const per100 = words > 0 ? Math.round((jargonHits / words) * 1000) / 10 : 0;
  const band: JargonDensityBand =
    per100 >= 6 ? "very-heavy" : per100 >= 4 ? "heavy" : per100 >= 2 ? "moderate" : "light";
  const label =
    band === "light"
      ? "Light jargon"
      : band === "moderate"
        ? "Moderate jargon"
        : band === "heavy"
          ? "Heavy jargon"
          : "Very heavy jargon";
  return { band, per100, label };
}
