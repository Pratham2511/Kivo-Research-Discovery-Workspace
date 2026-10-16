import { NextRequest, NextResponse } from "next/server";
import { LlmError, llmComplete, requestLlmConfig } from "@/lib/llm";
import { checkRateLimit, rateLimitedResponse } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const limit = checkRateLimit(req, { max: 3, windowMs: 60_000 });
  if (!limit.ok) return rateLimitedResponse(limit);
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const config = requestLlmConfig(req.headers);
    if (!config) return NextResponse.json({ error: "Add an API key in Settings first." }, { status: 400, headers });
    // Exactly one generation on the selected model. No retries or paper text.
    const reply = await llmComplete([{ role: "user", content: "Reply with the word OK only." }], { config, timeoutMs: 20_000, maxTokens: 1024 });
    if (!reply) throw new LlmError("The selected model returned no text. Choose another text model and test again.", 400);
    return NextResponse.json({ ok: true, model: config.model }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LlmError ? error.message : "Connection test failed." }, { status: error instanceof LlmError ? error.status : 500, headers });
  }
}
