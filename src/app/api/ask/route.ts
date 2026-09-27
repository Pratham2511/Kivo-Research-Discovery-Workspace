import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { llmComplete, llmStatus } from "@/lib/llm";
import { checkRateLimit, rateLimitedResponse } from "@/lib/security";
import { groundedQuotes, matchingPassages } from "@/lib/workspace/grounding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ask — grounded Q&A over one paper's stored text.
 *
 * The no-hallucination contract (FUTURE_FEATURES.md #7):
 *   1. The client sends the paper's verbatim sources (abstract + extracted
 *      PDF pages — nothing else is consulted).
 *   2. The server retrieves the question-relevant passages and asks the
 *      model to answer strictly from them, quoting verbatim.
 *   3. Every quote the model returns is re-verified server-side as an
 *      exact substring of a retrieved passage. Unverified quotes are
 *      dropped and disclosed; an answer with zero verified quotes never
 *      ships — the route abstains instead.
 *
 * Answers are cached in memory by (sources hash, question).
 */
const bodySchema = z.object({
  question: z.string().trim().min(5).max(500),
  paperId: z.string().trim().min(1).max(500),
  passages: z
    .array(
      z.object({
        page: z.number().int().min(0).max(500),
        text: z.string().min(1).max(60_000),
      }),
    )
    .min(1)
    .max(60),
});

interface CachedAnswer {
  answer: string | null;
  quotes: Array<{ page: number; text: string }>;
  droppedQuotes: number;
  reason?:
    | "no-relevant-passages"
    | "unsupported"
    | "model-unavailable"
    | "not-configured";
}
const CACHE = new Map<string, CachedAnswer>();
const CACHE_CAP = 200;

const SYSTEM_PROMPT = `You are a research reading assistant answering questions about ONE academic paper, for a student.

You may use ONLY the numbered passages provided. Each passage is a verbatim excerpt from the paper's stored text (page 0 is the abstract; page N is an extracted PDF page).

Rules:
1. Answer using only information present in the passages. Do not use outside knowledge, even if you know the paper.
2. Support the answer with 1-3 quotes. Each quote must be copied VERBATIM — an exact substring of one passage — and must carry that passage's page number.
3. If the passages do not contain enough information to answer, return { "answer": null }.
4. Keep answers 2-4 sentences, plain text, no markdown.

Respond with a single JSON object and nothing else (no code fences):
{ "answer": "..." | null, "quotes": [ { "page": 0, "text": "verbatim substring" } ] }`;

function extractJson(raw: string): { answer: string | null; quotes?: unknown } | null {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    parsedBody = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid question request — a question (5-500 chars) and at least one passage are required." },
      { status: 400 },
    );
  }
  const { question, passages } = parsedBody;

  // Total-context sanity cap (the retrieval only keeps the best chunks).
  const totalChars = passages.reduce((sum, p) => sum + p.text.length, 0);
  if (totalChars > 400_000) {
    return NextResponse.json(
      { error: "The supplied sources are too large for grounded Q&A." },
      { status: 413 },
    );
  }

  // Cache by (sources + question) — identical asks are free.
  const cacheKey = createHash("sha256")
    .update(question + "\u0000" + JSON.stringify(passages))
    .digest("hex");
  const cached = CACHE.get(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  // 1. Retrieval: only question-relevant chunks are ever shown to the model.
  const relevant = matchingPassages(passages, question);
  if (relevant.length === 0) {
    const abstain: CachedAnswer = {
      answer: null,
      quotes: [],
      droppedQuotes: 0,
      reason: "no-relevant-passages",
    };
    return NextResponse.json(abstain);
  }

  // 2. Ask the model, strictly from the retrieved passages. Any
  //    OpenAI-compatible endpoint works (see src/lib/llm.ts); without a
  //    configured provider the route abstains honestly instead of guessing.
  if (!llmStatus().enabled) {
    const abstain: CachedAnswer = {
      answer: null,
      quotes: [],
      droppedQuotes: 0,
      reason: "not-configured",
    };
    return NextResponse.json(abstain);
  }

  const userMessage =
    `Question: ${question}\n\nPassages (verbatim, from the paper's stored text):\n` +
    relevant.map((p) => `[page ${p.page}]\n${p.text}`).join("\n\n");

  let raw: string | null = null;
  try {
    raw = await llmComplete([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ]);
  } catch {
    raw = null;
  }

  if (!raw) {
    const abstain: CachedAnswer = {
      answer: null,
      quotes: [],
      droppedQuotes: 0,
      reason: "model-unavailable",
    };
    return NextResponse.json(abstain);
  }

  // 3. Verify: quotes must be exact substrings of the retrieved passages.
  let parsed = extractJson(raw);
  if (!parsed) {
    // One strict retry — JSON discipline is the most common single failure.
    const retry = await llmComplete([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          "That was not valid JSON per the contract. Return ONLY the JSON object now.",
      },
    ]);
    if (retry) parsed = extractJson(retry);
  }

  const answerText =
    parsed && typeof parsed.answer === "string" && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : null;

  const verified = parsed ? groundedQuotes(parsed.quotes, relevant) : [];
  const providedQuotes = Array.isArray(parsed?.quotes) ? parsed.quotes.length : 0;
  const droppedQuotes = Math.max(0, providedQuotes - verified.length);

  // 4. The contract: no verified quote, no answer.
  if (!answerText || verified.length === 0) {
    const abstain: CachedAnswer = {
      answer: null,
      quotes: [],
      droppedQuotes,
      reason: "unsupported",
    };
    CACHE.set(cacheKey, abstain);
    trimCache();
    return NextResponse.json(abstain);
  }

  const result: CachedAnswer = {
    answer: answerText,
    quotes: verified,
    droppedQuotes,
  };
  CACHE.set(cacheKey, result);
  trimCache();
  return NextResponse.json({ ...result, cached: false });
}

function trimCache() {
  while (CACHE.size > CACHE_CAP) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}
