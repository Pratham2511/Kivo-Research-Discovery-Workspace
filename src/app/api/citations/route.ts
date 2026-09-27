import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchCitationContexts,
  fetchCitationGraph,
  resolveS2ByTitle,
} from "@/lib/academic/citations";
import { checkRateLimit, rateLimitedResponse } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/citations?paperId=…&type=refs|cites[&title=…&fallback=1&contexts=1]
 *
 * Thin, validated wrapper around the Semantic Scholar citation-graph fetch.
 * `paperId` must be an S2-resolvable identifier (40-hex S2 id, DOI:…,
 * ARXIV:…, PMID:…) — or the literal `SEARCH` when the client wants a
 * title-based best-match resolution (last resort, e.g. placeholder
 * proceedings DOIs that S2 never indexed).
 *
 * `contexts=1` switches to smart-citation mode: instead of neighbour
 * metadata, the response carries the citation contexts (the sentences in
 * which later papers cite this one) for local stance classification.
 */
const querySchema = z.object({
  paperId: z.string().trim().min(1).max(500),
  type: z.enum(["refs", "cites"]).default("refs"),
  title: z.string().trim().max(1000).default(""),
  fallback: z.enum(["0", "1"]).default("0"),
  contexts: z.enum(["0", "1"]).default("0"),
});

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(req, { max: 30, windowMs: 60000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  const params = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    paperId: params.get("paperId") ?? "",
    type: params.get("type") ?? "refs",
    title: params.get("title") ?? "",
    fallback: params.get("fallback") ?? "0",
    contexts: params.get("contexts") ?? "0",
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid citation request",
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }

  let { paperId, title, type } = parsed.data;
  const wantsTitleFallback = parsed.data.fallback === "1";
  const wantsContexts = parsed.data.contexts === "1";
  let resolvedBy: "id" | "title-search" = "id";

  if (paperId === "SEARCH") {
    if (!title) {
      return NextResponse.json(
        { error: "Title search requires a title." },
        { status: 400 },
      );
    }
    let resolved: string | null = null;
    try {
      resolved = await resolveS2ByTitle(title);
    } catch {
      return NextResponse.json(
        {
          error:
            "Semantic Scholar is rate-limiting citation requests. Please try again in a minute.",
        },
        { status: 502 },
      );
    }
    if (!resolved) {
      return NextResponse.json(
        { error: "No Semantic Scholar record matched this title." },
        { status: 404 },
      );
    }
    paperId = resolved;
    resolvedBy = "title-search";
  }

  try {
    if (wantsContexts) {
      const contexts = await fetchCitationContexts(paperId);
      return NextResponse.json({
        mode: "contexts",
        contexts,
        count: contexts.length,
        resolvedBy,
      });
    }

    const result = await fetchCitationGraph(paperId, title, type);
    // fetchCitationGraph fills exactly one side by query type — pick that
    // side (the old "references" in result check always matched and silently
    // returned the empty array for cites queries).
    const neighbors =
      type === "cites" ? result.citations : result.references;

    return NextResponse.json({
      type,
      neighbors,
      count: neighbors.length,
      resolvedBy,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "The citation provider could not be reached.";
    // Optional title fallback for identifiers S2 does not index (bad DOI).
    if (wantsTitleFallback && title) {
      try {
        const resolved = await resolveS2ByTitle(title);
        if (resolved) {
          if (wantsContexts) {
            const contexts = await fetchCitationContexts(resolved);
            return NextResponse.json({
              mode: "contexts",
              contexts,
              count: contexts.length,
              resolvedBy: "title-search",
            });
          }
          const retry = await fetchCitationGraph(resolved, title, type);
          const neighbors =
            type === "cites" ? retry.citations : retry.references;
          return NextResponse.json({
            type,
            neighbors,
            count: neighbors.length,
            resolvedBy: "title-search",
          });
        }
      } catch {
        /* fall through to the original error */
      }
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
