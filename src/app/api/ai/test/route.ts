import { NextRequest, NextResponse } from "next/server";
import { LlmError, providerFailure, requestLlmConfig } from "@/lib/llm";
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
    // One authenticated metadata request; no generated tokens or paper text.
    const response = await fetch(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw providerFailure(response.status);
    await response.body?.cancel();
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LlmError ? error.message : "Connection test failed." }, { status: error instanceof LlmError ? error.status : 500, headers });
  }
}
