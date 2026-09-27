import type { Paper } from "./schema";

/**
 * Forgiving BibTeX & RIS importers.
 *
 * Goal: accept what reference managers actually export (Zotero, Mendeley,
 * JabRef) without choking on odd field names, Unicode, or concatenated
 * author lists — and normalize into the workspace `Paper` shape using the
 * same id conventions as live search results (`doi:…`), so a later Crossref
 * hit merges instead of duplicating.
 */

export interface ImportResult {
  papers: Paper[];
  skipped: number;
  errors: string[];
}

/** Stable short hash for id-minting when no DOI exists. */
function shortHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ input.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 12);
}

function cleanDoi(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
  if (!value || !/^10\./.test(value)) return null;
  return value.slice(0, 500);
}

/** Split BibTeX `and`-separated authors; keep `Family, Given` order intact. */
function splitAuthors(raw: string): string[] {
  return raw
    .split(/\s+and\s+/i)
    .map((a) => a.trim().replace(/[{}]/g, "").replace(/\s+/g, " "))
    .filter((a) => a.length > 0 && a.toLowerCase() !== "others")
    .slice(0, 500);
}

/** Unwrap one level of braces and tidy whitespace inside a field value. */
function unwrap(value: string): string {
  let out = value.trim();
  // String concatenation: {A} {B} # {C} → keep simple join
  out = out.replace(/\s*#\s*/g, " ");
  if (out.startsWith("{") && out.endsWith("}")) {
    out = out.slice(1, -1);
  } else if (out.startsWith('"') && out.endsWith('"')) {
    out = out.slice(1, -1);
  }
  return out.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function toPaper(input: {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  venue: string | null;
  publisher: string | null;
  abstract: string;
  paperType: string;
}): Paper | null {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) return null;

  const doi = input.doi ? cleanDoi(input.doi) : null;
  const id = doi ? `doi:${doi}` : `import:${shortHash(title + (input.authors[0] || "") + (input.year ?? ""))}`;

  return {
    id,
    title: title.slice(0, 1000),
    authors: input.authors.map((a) => a.slice(0, 300)),
    abstract: (input.abstract || "").slice(0, 16000),
    year: input.year,
    doi,
    pdfLink: null,
    citationCount: null,
    publisher: input.publisher ? input.publisher.slice(0, 1000) : null,
    sources: ["Import"],
    sourceUrls: [],
    keywords: [],
    openAccess: null,
    paperType: input.paperType,
    venue: input.venue ? input.venue.slice(0, 1000) : null,
    retrievedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ BibTeX */

const BIB_ENTRY_RE = /@(\w+)\s*\{\s*([^,]*),/g;

export function parseBibtex(source: string): ImportResult {
  const errors: string[] = [];
  const papers: Paper[] = [];
  let skipped = 0;

  // Find each entry start
  const starts: Array<{ type: string; key: string; from: number }> = [];
  BIB_ENTRY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BIB_ENTRY_RE.exec(source)) !== null) {
    starts.push({ type: match[1].toLowerCase(), key: match[2], from: match.index });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    if (start.type === "comment" || start.type === "preamble" || start.type === "string") {
      continue;
    }
    // Entry body runs to the next entry (or EOF)
    const body = source.slice(
      start.from,
      i + 1 < starts.length ? starts[i + 1].from : undefined
    );

    const fields = parseBibFields(body);

    const yearRaw = fields.year || fields.date || "";
    const year = /^\d{4}/.test(yearRaw.trim()) ? Number(yearRaw.trim().slice(0, 4)) : null;

    const paper = toPaper({
      title: fields.title || fields.chapter || "",
      authors: splitAuthors(fields.author || fields.editor || ""),
      year,
      doi: fields.doi || fields.url || "",
      venue: fields.journal || fields.booktitle || fields.publisher || "",
      publisher: fields.publisher || "",
      abstract: fields.abstract || fields.summary || "",
      paperType:
        start.type === "article"
          ? "journal-article"
          : start.type === "inproceedings" || start.type === "conference"
            ? "proceedings-article"
            : "import",
    });

    if (paper) {
      papers.push(paper);
    } else {
      skipped++;
      const keyLabel = start.key || "(no key)";
      errors.push(`Skipped entry "${keyLabel}": missing a title.`);
    }
  }

  return { papers, skipped, errors };
}

/** Parse `field = {value}` pairs (brace- and quote-aware) from one entry. */
function parseBibFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRe = /(\w+)\s*=\s*/g;
  fieldRe.lastIndex = 0;
  const positions: Array<{ name: string; nameStart: number; valueStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body)) !== null) {
    positions.push({
      name: m[1].toLowerCase(),
      nameStart: m.index,
      valueStart: m.index + m[0].length,
    });
  }
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    // Only treat as a field if it appears after the entry's first comma
    const head = body.slice(0, pos.valueStart);
    if ((head.match(/,/g) || []).length === 0) {
      // The entry key itself can look like a field position; skip it when it
      // immediately follows `@type{` with no comma in between.
      if (/@\w+\s*\{\s*[^,]*$/.test(head)) continue;
    }
    // The value runs to the START of the next field's name token (not past
    // its `= `), then a trailing comma is trimmed.
    const valueEnd =
      i + 1 < positions.length ? positions[i + 1].nameStart : body.length;
    const raw = body.slice(pos.valueStart, valueEnd).replace(/,\s*$/, "");
    fields[pos.name] = unwrap(raw);
  }
  return fields;
}

/* ------------------------------------------------------------------ RIS */

export function parseRis(source: string): ImportResult {
  const errors: string[] = [];
  const papers: Paper[] = [];
  let skipped = 0;

  const records = source.split(/\r?\n(?=TY\s{1,2}-)/i);
  for (const record of records) {
    if (!/TY\s{1,2}-/i.test(record)) continue;

    const tags: Record<string, string[]> = {};
    for (const line of record.split(/\r?\n/)) {
      const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
      if (!m) continue;
      const tag = m[1].toUpperCase();
      (tags[tag] = tags[tag] || []).push(m[2].trim());
    }

    const title = (tags.TI || tags.T1 || [])[0] || "";
    if (!title) {
      skipped++;
      errors.push("Skipped an RIS record without a title (TI/T1).");
      continue;
    }

    const yearRaw = (tags.PY || tags.Y1 || [""])[0];
    const year = /\d{4}/.test(yearRaw) ? Number(yearRaw.match(/\d{4}/)![0]) : null;

    papers.push(
      toPaper({
        title,
        authors: (tags.AU || tags.A1 || []).map((a) => a.replace(/\s+/g, " ")).slice(0, 500),
        year,
        doi: (tags.DO || [""])[0] || "",
        venue: (tags.JO || tags.JF || tags.T2 || [""])[0] || "",
        publisher: (tags.PB || [""])[0] || "",
        abstract: (tags.AB || tags.N2 || [""])[0] || "",
        paperType: "import",
      })!
    );
  }

  return { papers, skipped, errors };
}

/* ------------------------------------------------------------------ router */

export function parseReferenceImport(source: string): ImportResult {
  const text = source.trim();
  if (!text) return { papers: [], skipped: 0, errors: ["Nothing to import — the text is empty."] };
  // RIS files start with a TY tag; BibTeX starts with an @entry.
  if (/^TY\s{1,2}-/i.test(text)) return parseRis(text);
  if (/^%0/.test(text)) return parseEndnote(text);
  if (/@\w+\s*\{/.test(text)) return parseBibtex(text);
  return {
    papers: [],
    skipped: 0,
    errors: [
      "Unrecognized format. Paste BibTeX (starts with @article{…}) or RIS (starts with TY  - JOUR).",
    ],
  };
}

/** EndNote tagged (%0 …) — treat like RIS with % aliases. */
function parseEndnote(source: string): ImportResult {
  const converted = source
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^%([A-Z0-9])\s+(.*)$/i);
      if (!m) return line;
      const map: Record<string, string> = {
        "0": "TY  - JOUR",
        T: "TI  - ",
        A: "AU  - ",
        D: "PY  - ",
        J: "JO  - ",
        V: "VL  - ",
        X: "AB  - ",
      };
      const tag = m[1].toUpperCase();
      if (map[tag] === "TY  - JOUR") return "TY  - JOUR";
      if (map[tag]) return map[tag] + m[2];
      return "";
    })
    .join("\n");
  return parseRis(converted);
}
