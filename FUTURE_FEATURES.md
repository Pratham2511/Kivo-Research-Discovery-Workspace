# KIVO — Future Features

> A researched roadmap for turning KIVO from a personal evidence desk into a
> complete **student research companion**. Every feature below is grounded in
> published research, widely-requested needs from the systematic-review
> community, or proven learning science — and every one includes a concrete
> implementation plan against the codebase that already exists in this repo.

---

## Why these features

Students are not mini-professionals. Research on information overload shows
that undergraduates specifically struggle with *concluding and assessing the
quality* of their sources, and that overload measurably degrades academic
performance (Arnold et al., 2023 — *Dealing with information overload: a
comprehensive review*; Shahrzadi et al., 2024). Meanwhile the tools that
solve these problems for professional researchers — Covidence, Rayyan, scite,
Connected Papers — are priced and scoped for labs, not classrooms.

KIVO's local-first, evidence-grounded architecture is uniquely positioned to
give students the professional workflow **for free**, and to add the learning
features professionals don't even need.

---

## Tier 1 — High impact, low effort (build next)

### 1. PRISMA Flow Diagram Generator

**Evidence & precedent.** The PRISMA 2020 flow diagram is the standard
reporting artefact for systematic reviews and is explicitly taught in
research-methods courses. Rayyan and Covidence charge for exactly this
("a lifesaver" per Rayyan's own user guides); university guides routinely
walk students through building them by hand.

**Feature.** One button on the Projects view: *Export PRISMA diagram* — an
SVG/PNG flow diagram generated from the project's real screening counts:
records identified → duplicates removed → screened → excluded with reasons →
included.

**Implementation plan.**
1. The data already exists: `Project.members[]` carries `decision`
   (include/exclude/maybe/unscreened) and `reason`; `draft.events` is a full
   audit trail with before/after states; `Workspace.searches[]` stores the
   number of records each source returned.
2. Add `src/lib/workspace/prisma-flow.ts`: a pure function
   `buildPrismaCounts(project, searches) → PrismaCounts` that aggregates
   identified / deduplicated / screened / excluded / included numbers.
3. Render the diagram as inline SVG in a new component
   `src/components/workspace/prisma-dialog.tsx` (shadcn `Dialog` is already
   in `src/components/ui/`), with a "Download SVG" and "Copy counts" action.
4. No backend changes; no schema changes. ~1 day of work.

### 2. Evidence Flashcards with Spaced Repetition

**Evidence & precedent.** The spacing effect is one of the most replicated
results in learning science: spaced repetition + active recall measurably
improves exam performance (Yuan et al., 2022 — *Evidence of the Spacing
Effect*; multiple meta-analyses in medical education). No reference manager
ships this. For a student, "review the key findings of the 12 papers I read
for my lit review" is a genuine study need — KIVO already holds exactly that
material as structured evidence.

**Feature.** A new **Review** mode: every captured evidence item becomes a
flashcard (field = prompt, statement = answer). Cards are scheduled with an
SM-2 style algorithm; a small daily queue shows what's due. Streaks and a
"due today" counter keep it habit-forming.

**Implementation plan.**
1. Extend `workspaceSchema` with a versioned `reviews` map:
   `evidenceId → { ease, intervalDays, dueAt, reps, lapses }` (bump
   `version` to 2 and migrate in `normalizeWorkspace`, which already
   handles legacy shapes).
2. Add `src/lib/workspace/srs.ts` implementing SM-2 (≈60 lines, pure).
3. New view `src/components/workspace/review-view.tsx`: due-queue, show
   field + paper title, reveal statement, grade 1–4.
4. Register as section `07 / Review` in `WorkspaceShell` (the shell's
   `NAV_ITEMS` array is the only touch point) and a badge with due count.
5. Fully local; no API changes. ~2 days.

### 3. BibTeX / RIS Import (Zotero round-trip)

**Evidence & precedent.** Zotero is the tool students actually use; every
"academic productivity" roundup ranks it first for citation management.
Right now KIVO exports BibTeX but cannot ingest it — so a student's existing
library can't seed KIVO and anything they capture here has to be re-entered
in Zotero.

**Feature.** "Import" on the Library view: paste or drop a `.bib` / `.ris`
file; papers are normalized into `Workspace["papers"]` entries with DOIs,
years, venues preserved; duplicates against the current library are shown
before commit.

**Implementation plan.**
1. Add `src/lib/workspace/bibtex.ts` — a forgiving BibTeX parser (entry
   types `article`, `inproceedings`, `misc`; fields `title`, `author`,
   `year`, `doi`, `journal`/`booktitle`, `abstract`). RIS parsing is even
   simpler (line-oriented `TY/TI/AU/PY/DO` tags).
2. Reuse `paperSchema` (already zod-validated) for shape; mint ids as
   `doi:…` or `bibtex:<hash>` via the existing `dedup.ts` key logic so
   Crossref results later merge with imported records automatically.
3. Wire a file-drop zone into `saved-view.tsx` next to the export buttons.
4. ~1.5 days.

### 4. PDF Upload with Page-Anchored Evidence

**Evidence & precedent.** The workspace schema **already** contains a
`documents` model with per-page text and SHA-256 hashes — this was a
documented KIVO capability that the current UI dropped. Evidence captured
against a page number is dramatically more defensible than abstract-only
evidence, and students are regularly asked "quote from the full text."

**Feature.** In the Reader: upload a PDF (≤15 MB) → text extracted per page
→ highlight any passage on any page → capture as evidence with
`documentId` + `page` (both fields already exist in `evidenceSchema`).

**Implementation plan.**
1. `POST /api/extract` route: accept multipart upload, run extraction with
   `unpdf` (already in `package.json`), return `{ pages: [{page, text}] }`.
   Enforce the 15 MB / 500-page caps server-side with zod.
2. Client: `reader-view.tsx` gains a document panel — page selector +
   text pane; `onCaptureEvidence` already accepts `documentId`/`page`, and
   the verbatim check (`page.text.includes(quote)`) mirrors the abstract
   check that exists today.
3. Store in `draft.documents` (capped at 100 by schema, already).
4. ~2–3 days (mostly UI).

---

## Tier 2 — High impact, medium effort

### 5. Citation Graph Explorer ("Connected Papers for free")

**Evidence & precedent.** Connected Papers (Behera & Tripathy, 2023 —
*Visual Exploration of Literature Using Connected Papers*, 50+ citations)
showed that visual citation/similarity graphs measurably speed up literature
discovery. It's a paid tool; the underlying data (Semantic Scholar Graph
API) is free.

**Feature.** From any paper: "Explore graph" opens a full-screen
force-directed map — the paper at centre, its references and citations
(`lib/academic/citations.ts` **already implements** this fetch with stable
ID validation and 20-neighbour bounds), sized/coloured by year and access.
Click a node → open in Reader; double-click → re-centre the graph.

**Implementation plan.**
1. Backend exists: `fetchCitationGraph()` in
   `src/lib/academic/citations.ts`. Expose it via
   `GET /api/citations?paperId=…&type=refs|cites`.
2. Frontend: `graph-view.tsx` with `d3-force` (d3 is already a dependency).
   Nodes are `Paper` objects → reuse `resolvePaperAccess` for badges.
3. Persist explored graphs in `Workspace.searches`-style history so the
   desk remembers what was mapped.
4. ~3–4 days.

### 6. Smart Citations — supporting / contrasting / mentioning

**Evidence & precedent.** scite.ai built an entire business on classifying
citation contexts into *supporting*, *contrasting*, and *mentioning* — the
feature students most need when judging whether a famous result has held up,
and the thing peer review rarely tells you.

**Feature.** In the Reader, a "How is this cited?" panel: pull citation
contexts (Semantic Scholar returns the `citing paper` + snippet), classify
each snippet locally (keyword/heuristic baseline: contrast markers like
"however", "in contrast", "fails to", "contradicts"), and show a tally:
**18 supporting · 3 contrasting · 40 mentioning** with the snippets
underneath.

**Implementation plan.**
1. Extend `fetchCitationGraph` to request `contexts` field from the S2 API.
2. `src/lib/academic/stance.ts`: transparent, auditable heuristic
   classifier (no black box — matches KIVO's design philosophy). Ship the
   rule list in the UI so it can be cited in a methods section.
3. Render in reader-view as a collapsible section with stance tickets.
4. Optional later: upgrade to a model-based classifier behind
   `AI_ENABLED=true` using the existing `grounding.ts` pattern.
5. ~3 days.

### 7. Grounded AI Q&A on Saved Papers (re-enable AI path)

**Evidence & precedent.** KIVO's own README documents a conservative,
grounded Q&A flow (model must select verbatim passages; server rejects
quotations not present on the cited page; unsupported questions abstain).
That code path (`src/lib/workspace/grounding.ts`) survives in the repo but
is unwired in the current UI. For students, "ask my library" with a
guaranteed-no-hallucination contract is a killer feature no mainstream tool
offers honestly.

**Feature.** A "Ask" box in the Reader: question in → answer assembled only
from verbatim abstract (or PDF page) passages, each with a page/paragraph
pointer; if the sources don't contain the answer, it says so.

**Implementation plan.**
1. `POST /api/ask` gated on `AI_ENABLED=true` (env contract already
   documented in README): build context from the paper's stored text, call
   the configured OpenAI-compatible endpoint, then run the existing
   `grounding.ts` verifier server-side.
2. Cache by `(document hash, question, model)` as the README specifies.
3. UI: a panel in `reader-view.tsx` with citations rendered as clickable
   passages that scroll-and-highlight the source text.
4. ~3 days.

### 8. Focus Sessions & Reading Streaks

**Evidence & precedent.** The information-overload literature (Arnold 2023;
Shahrzadi 2024) prescribes *bounded, goal-directed* consumption as the main
countermeasure. For students this arrives as "read 3 papers today" plans
that actually stick.

**Feature.** A daily reading goal (papers screened or evidence captured);
a visible streak calendar (GitHub-style, 12 weeks); a "focus session" mode
that greys out everything except the current paper + capture panel for a
25-minute Pomodoro.

**Implementation plan.**
1. Track daily activity counters in a new `Workspace.activity` map
   (date → counts) — trivially derivable from `events` + `evidence.createdAt`.
2. `focus-timer.tsx` — pure client countdown + a
   `.bench-card:focus-within` full-screen overlay variant.
3. Streak calendar component reusing the `stat-cell` visual language.
4. ~2 days.

---

## Tier 3 — Strategic bets (semester-scale)

### 9. Seminar Mode — shared screening & peer annotation ✅ shipped in v3.6

**Shipped notes.** Implemented as the third tab of Projects (`Seminar · peer κ`):
`src/lib/workspace/seminar.ts` (bundle v1 schema + exportSeminarBundle /
blindProjectFromBundle / cohenKappa / buildKappaReport / kappaMarkdown),
`seminar-panel.tsx` (3-step rail, export/import cards, κ report with
Landis & Koch bands, side-by-side reason diff, Markdown export). The peer
import wipes decisions by design (blind screening); the exporter's κ report
diffs the returned bundle against the live project over co-screened papers
only. The optional live sync mini-service remains deliberately unbuilt
(local-first file exchange preserves the trust model).

**Evidence & precedent.** Collaborative annotation is proven pedagogy:
social annotation with the CERIC method measurably improves critical
reading of primary literature in graduate courses; hypothes.is is built
entirely on this. Covidence's blind dual-screening is the professional
version — students doing group projects currently have neither.

**Feature.** Export a project as a **seminar bundle** (JSON: question,
criteria, member papers, per-student screening so far). A peer imports it,
screens blind, and returns their bundle; KIVO diffs the two and produces a
disagreement report (κ agreement per paper) plus a merged decision queue.

**Implementation plan.**
1. `exportSeminarBundle(project, reviewer)` / `importPeerBundle(bundle)` —
   pure functions over the existing schema; no server needed (files travel
   by email/LMS, preserving local-first privacy).
2. Disagreement report: Cohen's κ over decision pairs + a side-by-side
   reason diff view.
3. Later: a tiny optional sync mini-service (WebSocket relay) for live
   co-screening, reusing the gateway's `XTransformPort` pattern.
4. ~1–2 weeks.

### 10. Argument Builder — evidence → claims → outline ✅ shipped in v3.5

**Shipped notes.** Implemented as `09 / Argument builder` (schema v3
`claims[]`, `src/lib/workspace/argument.ts`, `builder-view.tsx`). Stances
are support/qualify/contradict; coverage report + Markdown outline export
included. Drag-drop was traded for click-to-attach (select a claim, then
attach from the evidence pool) — works identically on touch devices.

**Evidence & precedent.** Synthesis — not collection — is where literature
reviews fail. Writing centres and the rhetoric literature describe
"claim–evidence–warrant" structures (Toulmin) as the scaffold students
lack. KIVO is one step away: evidence is already classified by field.

**Feature.** A Builder view: student states claims, attaches captured
evidence to each claim (one-to-many), marks whether each item *supports*,
*qualifies*, or *contradicts*; KIVO renders a Toulmin-style map and exports
(a) a Markdown outline with inline evidence citations, and (b) a claim
coverage report ("claim 3 has no supporting evidence yet").

**Implementation plan.**
1. New top-level `claims[]` in the workspace schema:
   `{ id, text, evidenceIds: [{id, stance}], notes }`.
2. Builder UI: two-pane (claims left, evidence pool right) with drag-drop
   (dnd-kit is already a dependency).
3. Exporters extend the existing `src/lib/workspace/exports.ts` pattern.
4. ~1 week.

### 11. Reading Level & Jargon Heatmap ✅ shipped in v3.6

**Shipped notes.** `src/lib/reading/` — lexicon.ts (bundled ~130-term
CS/bio/methods glossary, static and auditable), readability.ts (FK grade +
reading levels + density bands), jargon.ts (longest-first plural-aware
detection + lossless segmentation). Reader panel "Make it approachable":
2×2 stat strip, toggleable heatmap with hover glosses, glossary grid, and
an AI plain-language rewrite behind a **no-distortion contract** — the
server mechanically verifies that every technical term and every number
from the original survive the rewrite (`POST /api/gloss`), one strict
retry, then an honest refusal card. Before/after FK grade shown on every
rewrite.

**Evidence & precedent.** Readability-adjustment research shows domain
jargon is the primary barrier for novices entering a field. A tool that
makes abstracts *approachable* — without dumbing them down — directly
serves first- and second-year students.

**Feature.** On any abstract: a "make it approachable" toggle that (a)
highlights jargon terms (frequency-rare bigrams/trigrams against a domain
lexicon), (b) shows plain-language glosses for the top-N terms from a
bundled glossary + optional grounded AI rewrite that must keep every
technical term intact, and (c) a Flesch–Kincaid score before/after.

**Implementation plan.**
1. `src/lib/reading/lexicon.ts` — bundled CS/bio glossary (seed from
   Wikipedia redirect titles, ship as static JSON).
2. `src/lib/reading/readability.ts` — syllable/heuristic FK grade (pure).
3. Highlight overlay component over the existing abstract panel.
4. AI gloss/rewrite behind `AI_ENABLED` with the grounding verifier.
5. ~1 week.

### 12. Reproducibility Labels ("Can I rerun this?") ✅ shipped in v3.5

**Shipped notes.** `memberSchema.repro` tri-state checklist (code/data/
seeds + license), edited in the Projects screening queue, surfaced on
Library paper cards ("Repro N/3"), as a Compare matrix row, and in the
screening CSV export.

**Evidence & precedent.** Papers with code+data get cited more and
replicate better (well-documented open-science literature). Students in ML
courses are increasingly required to attempt replication; finding out
*whether a paper is replicable* before committing is the hard part.

**Feature.** KIVO already extracts `Code / data` as an evidence field.
Formalize it: for every included paper, a small structured checklist
(dataset public? code linked? seeds/hyperparams stated? license permissive?)
rendered as reproducibility tickets on the paper card and as a column in
the Compare matrix.

**Implementation plan.**
1. Extend `memberSchema` with an optional `repro: { code, data, seeds,
   license }` checklist.
2. Render in `paper-card.tsx` (badge) + `compare-view.tsx` (row) + matrix.
3. Export in screening CSV.
4. ~2 days.

---

## Non-features (deliberate)

- **No cloud accounts / sync service.** Local-first is the product
  philosophy; sync would change the trust model for a tool whose entire
  value is "your evidence, defensibly yours."
- **No model-generated papers or fake "AI summaries" without grounding.**
  Anything AI-produced must pass the verbatim-passage verifier, or abstain.
- **No recommendation feed.** Discovery stays query-driven — the
  information-overload literature is unambiguous that infinite feeds harm
  exactly the users (students) KIVO serves.

---

## Suggested build order

| Order | Feature | Status |
| ----- | ------- | ------ |
| 1 | PRISMA diagram | ✅ shipped (v3.1) |
| 2 | Evidence flashcards | ✅ shipped (v3.2) |
| 3 | BibTeX import | ✅ shipped (v3.1) |
| 4 | PDF page-anchored evidence | ✅ shipped (v3.3) |
| 5 | Citation graph explorer | ✅ shipped (v3.2) |
| 6 | Smart citations | ✅ shipped (v3.3) |
| 7 | Grounded Q&A | ✅ shipped (v3.4) |
| 8 | Focus/streaks | ✅ shipped (v3.3) |
| 9 | Seminar bundles + Cohen's κ | ✅ shipped (v3.6) |
| 10 | Argument builder | ✅ shipped (v3.5) |
| 11 | Reading level & jargon heatmap | ✅ shipped (v3.6) |
| 12 | Reproducibility labels | ✅ shipped (v3.5) |

**The roadmap is fully shipped — all 12 features across Tiers 1–3.**

## References

- Arnold, M. et al. (2023). *Dealing with information overload: a comprehensive review.* Review of Managerial Science.
- Shahrzadi, L. et al. (2024). *Causes, consequences, and strategies to deal with information overload.*
- Yuan, X. et al. (2022). *Evidence of the Spacing Effect and Influences on Perceptions and Behaviors.*
- Jayaram, S. et al. (2026). *Spaced repetition and active recall improves academic performance.*
- Behera, P. K. & Tripathy, B. K. (2023). *Visual Exploration of Literature Using Connected Papers.* (50+ citations)
- PRISMA 2020 statement & flow diagram specification (Page et al., BMJ 2021).
- scite.ai smart-citation methodology (Nicholson et al., 2021 — *scite: Smart Citations for Greater Reproducibility*).
- Sultan, S. — annotation-based education systems research on hypothes.is.
- CERIC method studies on social annotation improving critical reading of primary literature.
