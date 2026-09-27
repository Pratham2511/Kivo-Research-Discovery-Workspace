// Utility helpers shared across source adapters.

export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/gi, entity => {
      const named: Record<string,string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
      if (named[entity]) return named[entity];
      const n = entity.startsWith('&#x') ? parseInt(entity.slice(3,-1),16) : parseInt(entity.slice(2,-1),10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : entity;
    })
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

export function safeNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

export function truncate(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function buildId(...parts: (string | number | null | undefined)[]): string {
  const clean = parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean)
    .join("--");
  return clean || "unknown-" + Math.random().toString(36).slice(2, 8);
}

export function titleKey(title: string): string {
  return normalizeText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with",
  "by", "from", "at", "as", "is", "are", "be", "been", "this", "that",
  "these", "those", "it", "its", "into", "via", "using", "use", "based",
]);

export function extractKeywords(title: string, abstract: string, max = 8): string[] {
  const text = (title + " " + abstract).toLowerCase();
  const words = text.match(/[a-z][a-z0-9-]{2,}/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}
