export type Passage = { page: number; text: string };
export function matchingPassages(pages: Passage[], question: string) {
  const words = [...new Set(question.toLowerCase().match(/[a-z]{4,}/g) || [])];
  const chunks = pages.flatMap((p) =>
    p.text
      .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/)
      .filter((t) => t.trim())
      .map((text) => ({ page: p.page, text: text.slice(0, 2500) })),
  );
  return chunks
    .map((p) => ({
      ...p,
      hits: words.filter((w) => p.text.toLowerCase().includes(w)).length,
    }))
    .filter((p) => p.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 6);
}
export function groundedQuotes(raw: unknown, passages: Passage[]): Passage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Passage =>
        !!p &&
        typeof p.page === "number" &&
        typeof p.text === "string" &&
        p.text.trim().length > 10 &&
        passages.some((s) => s.page === p.page && s.text.includes(p.text)),
    )
    .slice(0, 6);
}
