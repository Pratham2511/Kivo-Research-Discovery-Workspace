import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { llmComplete, llmStatus, type LlmMessage } from "@/lib/llm";
import { checkRateLimit, rateLimitedResponse } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gloss — plain-language rewrite of one abstract (FUTURE_FEATURES #11).
 *
 * The no-distortion contract (the rewrite analogue of /api/ask's
 * no-hallucination contract):
 *   1. The client sends the paper's verbatim abstract plus the jargon terms
 *      its local lexicon detected (nothing else is consulted).
 *   2. The model is asked to rewrite the abstract in plain language while
 *      keeping EVERY technical term verbatim and EVERY number intact.
 *   3. The server re-verifies both properties mechanically before the
 *      rewrite is allowed to ship: a term list entry missing from the
 *      rewrite, or an abstract number that vanished, fails the rewrite.
 *      One strict retry, then an honest abstain.
 *
 * The rewrite is cached in memory by (abstract, terms).
 */

const bodySchema = z.object({
  paperId: z.string().trim().min(1).max(500),
  abstract: z.string().trim().min(80).max(20_000),
  terms: z
    .array(z.string().trim().min(2).max(80))
    .min(1)
    .max(30),
});

interface CachedGloss {
  rewrite: string | null;
  keptTerms: string[];
  numbersTotal: number;
  reason?:
    | "no-terms"
    | "verification-failed"
    | "model-unavailable"
    | "not-configured";
}
const CACHE = new Map<string, CachedGloss>();
const CACHE_CAP = 200;

const SYSTEM_PROMPT = `You are a plain-language editor for a research reading desk, rewriting ONE academic abstract for a second-year undergraduate.

You may use ONLY the abstract provided. Rules:
1. Rewrite it in plain, direct language a second-year student can follow. Short sentences. No new claims, no facts from outside knowledge, no commentary.
2. Keep EVERY technical term from the term list VERBATIM (spelled exactly the same, case-insensitive). Do not replace them with synonyms — define or contextualise them instead.
3. Keep every number, statistic and year that appears in the abstract (28.4 stays 28.4, 2014 stays 2014).
4. Keep it 3-7 sentences and noticeably shorter or clearer than the original.
5. Plain text only, no markdown, no lists.

Respond with the rewritten abstract as plain text and nothing else.`;

function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) || [];
}

function verify(
  rewrite: string,
  terms: string[],
  abstractNumbers: string[],
): { ok: boolean; missingTerms: string[]; missingNumbers: string[] } {
  const hay = normalizeForSearch(rewrite);
  const missingTerms = terms.filter((t) => !hay.includes(normalizeForSearch(t)));
  const missingNumbers = abstractNumbers.filter((n) => !rewrite.includes(n));
  return {
    ok: missingTerms.length === 0 && missingNumbers.length === 0,
    missingTerms,
    missingNumbers,
  };
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid gloss request — an abstract (80-20,000 chars) and 1-30 terms are required.",
      },
      { status: 400 },
    );
  }

  // Only terms actually present in the abstract are part of the contract.
  const abstractHay = normalizeForSearch(body.abstract);
  const validTerms = [
    ...new Set(
      body.terms.filter((t) => abstractHay.includes(normalizeForSearch(t))),
    ),
  ];
  if (validTerms.length === 0) {
    return NextResponse.json<CachedGloss>({
      rewrite: null,
      keptTerms: [],
      numbersTotal: 0,
      reason: "no-terms",
    });
  }

  const cacheKey = createHash("sha256")
    .update(JSON.stringify({ a: body.abstract, t: validTerms }))
    .digest("hex");
  const cached = CACHE.get(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const abstractNumbers = extractNumbers(body.abstract);
  const userMessage =
    `Term list (must appear verbatim in the rewrite):\n` +
    validTerms.map((t) => `- ${t}`).join("\n") +
    `\n\nAbstract (verbatim):\n${body.abstract}`;

  async function callModel(feedbackOn?: string): Promise<string | null> {
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];
    if (feedbackOn) {
      const f1 = verify(feedbackOn, validTerms, []);
      const f2 = verify(feedbackOn, [], abstractNumbers);
      messages.push({ role: "assistant", content: feedbackOn });
      messages.push({
        role: "user",
        content:
          `That rewrite broke the contract: missing terms [${f1.missingTerms.join(", ")}] / missing numbers [${f2.missingNumbers.join(", ")}]. ` +
          `Return a corrected rewrite that keeps every listed term verbatim and every number, plain text only.`,
      });
    }
    return llmComplete(messages);
  }

  // Any OpenAI-compatible endpoint works (see src/lib/llm.ts); without a
  // configured provider the route refuses honestly instead of shipping an
  // unverified rewrite. (Not cached — the provider can be configured at
  // any time without a stale refusal lingering in the process.)
  if (!llmStatus().enabled) {
    return NextResponse.json<CachedGloss>({
      rewrite: null,
      keptTerms: [],
      numbersTotal: abstractNumbers.length,
      reason: "not-configured",
    });
  }

  let rewrite = await callModel();

  // Verification + one strict retry with the failure reasons named.
  if (rewrite) {
    const check = verify(rewrite, validTerms, abstractNumbers);
    if (!check.ok) {
      rewrite = await callModel(rewrite);
    }
  }

  const fail = (reason: CachedGloss["reason"]): NextResponse => {
    const result: CachedGloss = {
      rewrite: null,
      keptTerms: [],
      numbersTotal: abstractNumbers.length,
      reason,
    };
    CACHE.set(cacheKey, result);
    trimCache();
    return NextResponse.json(result);
  };

  if (!rewrite) return fail("model-unavailable");
  const finalCheck = verify(rewrite, validTerms, abstractNumbers);
  if (!finalCheck.ok) return fail("verification-failed");

  const result: CachedGloss = {
    rewrite,
    keptTerms: validTerms,
    numbersTotal: abstractNumbers.length,
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
