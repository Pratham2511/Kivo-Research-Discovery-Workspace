import { NextRequest, NextResponse } from "next/server";
import { readWorkspace, writeWorkspace } from "@/lib/workspace/server";
import { workspaceSchema, validateEvidence } from "@/lib/workspace/schema";
import { readJsonBody } from "@/lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await readWorkspace());
  } catch (e) {
    console.error("[workspace]", e);
    return NextResponse.json(
      {
        error:
          "Saved research is unavailable. Start PostgreSQL and run database migrations, then retry.",
      },
      { status: 503 },
    );
  }
}
export async function PUT(req: NextRequest) {
  const body = await readJsonBody<{ state: unknown; revision: number }>(
    req,
    20 * 1024 * 1024,
  );
  if (!body.ok) return body.response;
  const parsed = workspaceSchema.safeParse(body.data?.state);
  if (!parsed.success || !Number.isInteger(body.data?.revision))
    return NextResponse.json(
      {
        error: "Invalid research workspace.",
        details: !parsed.success
          ? parsed.error.issues
              .slice(0, 3)
              .map((i) => i.path.join(".") + ": " + i.message)
          : ["Invalid revision"],
      },
      { status: 400 },
    );
  const error = validateEvidence(parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const saved = await writeWorkspace(parsed.data, body.data.revision);
    if (!saved)
      return NextResponse.json(
        {
          error:
            "Research changed in another tab or an alert check. Reload saved research before trying again.",
        },
        { status: 409 },
      );
    return NextResponse.json({ revision: body.data.revision + 1 });
  } catch {
    return NextResponse.json(
      {
        error: "Could not save research. Your changes have not been committed.",
      },
      { status: 503 },
    );
  }
}
