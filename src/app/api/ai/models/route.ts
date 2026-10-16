import { NextRequest, NextResponse } from "next/server";
import { LlmError, requestLlmConfig } from "@/lib/llm";
import { listProviderModels } from "@/lib/ai-models";
import { checkRateLimit, rateLimitedResponse } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const limit = checkRateLimit(req, { max: 5, windowMs: 60_000 });
  if (!limit.ok) return rateLimitedResponse(limit);
  try {
    const config = requestLlmConfig(req.headers, true);
    if (!config) return NextResponse.json({ error: "Enter your provider key first." }, { status: 400, headers });
    return NextResponse.json({ models: await listProviderModels(config) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LlmError ? error.message : "Could not load models." }, { status: error instanceof LlmError ? error.status : 500, headers });
  }
}
