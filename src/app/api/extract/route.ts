import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { checkRateLimit, rateLimitedResponse } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/extract — page-anchored evidence, step one.
 *
 * Accepts a multipart PDF upload (≤ 15 MB), extracts text page by page with
 * `unpdf`, and returns the pages plus a SHA-256 hash of the file. The client
 * stores the result in `Workspace.documents`; every captured passage is then
 * verbatim-checked against the exact page it claims to quote.
 *
 * Server-side caps (mirrored by the workspace schema):
 *   - 15 MB upload
 *   - 500 pages
 *   - 24,000 characters per page (dense pages are ~6k chars — the cap keeps
 *     the whole document comfortably inside browser localStorage)
 */
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 500;
const MAX_PAGE_CHARS = 24_000;

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file received — attach a PDF in the `file` field." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "PDFs up to 15 MB are supported — this one is larger." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Hash first: pdf.js may transfer/detach the underlying buffer during
  // extraction, which would silently turn a post-extraction hash into the
  // empty-input digest.
  const hash = createHash("sha256").update(bytes).digest("hex");
  // PDFs start with the literal "%PDF" magic — check content, not just the name.
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  if (!magic.startsWith("%PDF")) {
    return NextResponse.json(
      { error: "This file is not a PDF (missing %PDF header)." },
      { status: 415 },
    );
  }

  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const rawPages = Array.isArray(text) ? text : [text];
    const pageCount = Math.min(rawPages.length, totalPages || rawPages.length, MAX_PAGES);

    const pages = rawPages.slice(0, pageCount).map((t, i) => ({
      page: i + 1,
      // Strip NULs pdf.js emits for ligatures; trim runaway whitespace; cap.
      text: (t || "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .slice(0, MAX_PAGE_CHARS),
    }));

    const chars = pages.reduce((sum, p) => sum + p.text.length, 0);

    return NextResponse.json({
      name: file.name.slice(0, 300),
      hash,
      pages,
      meta: {
        pageCount,
        chars,
        truncated: (totalPages || rawPages.length) > MAX_PAGES,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Text could not be extracted from this PDF — it may be encrypted, a pure scan (no text layer), or corrupted.",
      },
      { status: 422 },
    );
  }
}
