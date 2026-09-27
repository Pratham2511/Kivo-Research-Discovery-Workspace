import { NextResponse } from "next/server";
import { llmStatus } from "@/lib/llm";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — one honest line about the desk.
 *
 * `ai.enabled` is false until a provider is configured (LLM_API_KEY +
 * optional LLM_BASE_URL / LLM_MODEL — any OpenAI-compatible endpoint).
 * Everything else in the app works without it.
 */
export async function GET() {
  const ai = llmStatus();
  return NextResponse.json({
    status: "ok",
    mode: "single-user-local",
    ai: {
      enabled: ai.enabled,
      provider: ai.label,
    },
  });
}
