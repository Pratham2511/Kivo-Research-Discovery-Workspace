import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  searchMultipleSources,
  DEFAULT_SOURCES,
  PROVIDERS,
} from "@/lib/academic/orchestrator";
import { prepareQuery } from "@/lib/academic/query";
import {
  checkRateLimit,
  rateLimitedResponse,
  readJsonBody,
} from "@/lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    query: z.string().trim().min(1).max(1000),
    filters: z
      .object({
        yearFrom: z.number().int().min(1800).max(2100).optional(),
        yearTo: z.number().int().min(1800).max(2100).optional(),
        author: z.string().max(200).optional(),
        publisher: z.string().max(200).optional(),
        minCitations: z.number().int().min(0).max(10000000).optional(),
        openAccessOnly: z.boolean().optional(),
        includeKeywords: z.array(z.string().max(100)).max(20).optional(),
        excludeKeywords: z.array(z.string().max(100)).max(20).optional(),
        paperType: z.string().max(100).optional(),
      })
      .default({}),
    sources: z
      .array(z.string().refine((s) => s in PROVIDERS))
      .min(1)
      .max(7)
      .optional(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().max(100).optional(),
  })
  .refine(
    (b) =>
      !b.filters.yearFrom ||
      !b.filters.yearTo ||
      b.filters.yearFrom <= b.filters.yearTo,
    "Start year must not exceed end year",
  );
type Snapshot = Awaited<ReturnType<typeof searchMultipleSources>>;
const sessions = new Map<
  string,
  { key: string; result: Snapshot; expires: number }
>();
const inFlight = new Map<
  string,
  { promise: Promise<Snapshot>; controller: AbortController; users: number }
>();
function page(result: Snapshot, id: string, offset: number, limit: number) {
  return {
    ...result,
    papers: result.papers.slice(offset, offset + limit),
    cursor:
      offset + limit < result.papers.length ? `${id}:${offset + limit}` : null,
  };
}
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { max: 30, windowMs: 60000 });
  if (!rl.ok) return rateLimitedResponse(rl);
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Invalid search request",
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  const {
    query,
    filters,
    sources = [...DEFAULT_SOURCES],
    limit,
    cursor,
  } = parsed.data;
  const key = JSON.stringify({ query, filters, sources: [...sources].sort() });
  for (const [id, s] of sessions)
    if (s.expires < Date.now()) sessions.delete(id);
  if (cursor) {
    const [id, raw] = cursor.split(":");
    const offset = Number(raw);
    const session = sessions.get(id);
    if (
      !session ||
      session.key !== key ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      return NextResponse.json(
        { error: "Search snapshot expired or changed. Run the search again." },
        { status: 410 },
      );
    return NextResponse.json(page(session.result, id, offset, limit));
  }
  for (const [id, s] of sessions)
    if (s.key === key) return NextResponse.json(page(s.result, id, 0, limit));
  let job = inFlight.get(key);
  if (job?.controller.signal.aborted) {
    inFlight.delete(key);
    job = undefined;
  }
  if (!job) {
    if (inFlight.size >= 10)
      return NextResponse.json(
        { error: "Search queue is full. Please retry shortly." },
        { status: 503 },
      );
    const controller = new AbortController();
    job = {
      controller,
      users: 0,
      promise: searchMultipleSources(prepareQuery(query, filters), {
        sources,
        signal: controller.signal,
      }),
    };
    inFlight.set(key, job);
  }
  job.users++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      if (--job!.users === 0) job!.controller.abort();
    }
  };
  req.signal.addEventListener("abort", release, { once: true });
  if (req.signal.aborted) release();
  try {
    const result = await job.promise;
    if (result.error) return NextResponse.json(result, { status: 503 });
    const id = crypto.randomUUID();
    if (sessions.size >= 30) sessions.delete(sessions.keys().next().value!);
    sessions.set(id, { key, result, expires: Date.now() + 300000 });
    return NextResponse.json(page(result, id, 0, limit));
  } catch {
    return NextResponse.json(
      { error: "Search was interrupted. Please retry." },
      { status: 503 },
    );
  } finally {
    req.signal.removeEventListener("abort", release);
    release();
    if (inFlight.get(key) === job) inFlight.delete(key);
  }
}
export async function GET() {
  return NextResponse.json({
    providers: Object.entries(PROVIDERS).map(([name, p]) => ({
      name,
      configured: !p.key || !!process.env[p.key],
      requiredKey: p.key,
      upstreamFilters: p.filters,
    })),
    defaults: DEFAULT_SOURCES,
  });
}
