# Changelog

All notable Kivo releases live here. Each entry preserves the original
release notes - design rationale, new features, fixes, and how the change
was verified in the browser. The most recent release is listed first.

For the live product overview, quick start, and architecture, see the
[README](README.md).

---

## v3.7 - provider-agnostic AI

Kivo no longer ships with — or routes through — any bundled AI middleware.
The two AI surfaces became **bring-your-own-provider**, and the desk is
**fully usable with AI switched off**.

### Design

- **No vendor SDK in the request path.** A ~90-line client
  (`src/lib/llm.ts`) speaks the standard OpenAI chat-completions protocol
  over `fetch` — nothing else. No middleware, no proxy, no bundled
  account.
- **Works with anything.** Point it at OpenAI, Groq, Together, Mistral,
  DeepSeek, OpenRouter or a local Ollama / llama.cpp server:

  ```sh
  LLM_API_KEY=sk-…                     # any non-empty string for local servers
  LLM_BASE_URL=https://api.openai.com/v1
  LLM_MODEL=gpt-4o-mini
  ```

  `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` work as aliases,
  so existing provider setups need zero new configuration.
- **Honest when off.** With no key configured, both surfaces return a
  dedicated `not-configured` abstain (not an error, not a guess) with
  copy that says exactly how to switch them on. That state is never
  cached, so configuring a provider takes effect immediately.
- **The contracts are unchanged and provider-independent.** Grounded Q&A
  still verifies every quote as a verbatim substring of the retrieved
  passages before an answer can ship; the plain-language rewrite still
  verifies every technical term and every number survived it. Whoever the
  model is, the desk — not the model — decides what ships.

### Fixes & engineering

- **Citation map "cited by" side silently empty** — `/api/citations` picked
  the `references` array for every query (`"references" in result` always
  matched), so `type=cites` returned a guaranteed-empty list. The side is
  now selected by query type (verified live: cites went from 0 neighbors
  to real records). Caught by running `tsc --noEmit` over the whole tree —
  which now passes cleanly and runs in CI.
- Removed the previously bundled AI middleware dependency entirely; the
  app carries **zero AI-vendor packages**.
- Request timeouts moved from `Promise.race` scaffolding to a proper
  `AbortController` inside the client; the strict JSON / contract retries
  in both routes are preserved.
- The model-facing system prompt now uses the standard `system` role
  (the previous SDK expected a non-standard role for it).
- `/api/health` now reports the live AI surface status and provider label
  (`{ ai: { enabled, provider } }`) — never the key.
- Package renamed to `kivo` (v3.6.0) with a proper description; see
  [Optional configuration](#optional-configuration) for the full env-var
  table.

### Verification

- `bun run lint` clean; both routes contract-checked (validation, rate
  limits, abstain reasons, cache behaviour unchanged for the non-AI
  paths).
- E2E in the browser: reader Q&A panel and reading-level rewrite show
  the honest "not configured" abstains with the setup hint; search,
  capture, compare, review, seminar and exports all unaffected; zero
  console errors in both themes and at 390 px.

---

## v3.6 - seminar & approachability

### New features

- **Reading level & jargon heatmap**.
  - `src/lib/reading/` — three new pure modules: `lexicon.ts` (bundled
    ~130-term CS/bio/methods glossary — static, auditable, versioned in
    the repo; no model involved in detection), `readability.ts`
    (Flesch–Kincaid grade via the vowel-group syllable heuristic, reading
    level labels, jargon density bands), `jargon.ts` (longest-first,
    plural-aware, non-overlapping term detection + lossless abstract
    segmentation — the roundtrip is exact by construction).
  - Reader panel **"Make it approachable"**: 2×2 stat strip (grade · term
    count · density per 100 words · sentence length), a toggleable heatmap
    that marks every detected term (hover for the gloss), a glossary grid
    of detected terms with one-sentence plain-language glosses, and a
    method disclosure (the FK formula + lexicon location).
  - **Plain-language rewrite (AI, verified)** — `POST /api/gloss` behind a
    **no-distortion contract** (the rewrite analogue of the Q&A
    no-hallucination contract): the model rewrites the abstract for a
    second-year student, and the server mechanically verifies that every
    term from the detected list and every number/statistic/year from the
    original appear in the rewrite — one strict retry naming the missing
    pieces, then an honest REFUSED card. Every rewrite shows its
    before/after FK grade (16 → 13 in verification) and a copy action.
    Cached in memory by (abstract, terms); rate-limited 10/min.
- **Seminar Mode — blind peer screening + Cohen's κ**.
  - `src/lib/workspace/seminar.ts`: self-contained bundle format
    `kivo-seminar-bundle/v1` (project brief + member paper metadata + the
    exporter's own decisions), `exportSeminarBundle`, `blindProjectFromBundle`,
    `cohenKappa` (chance-corrected agreement over co-screened pairs;
    handles the undefined-denominator cases honestly), `buildKappaReport`
    (disagreements, one-sided screenings, and bundle papers never queued
    locally), and `kappaMarkdown` (seminar-minutes export).
  - Projects view gains a third tab, **Seminar · peer κ**: a 3-step rail
    (export → blind screen → import back), an export card (reviewer name
    is stamped on the bundle; requires ≥1 screened paper), and an import
    card. Importing opens an explicit fork — **Screen blind** (new
    seminar project, decisions wiped, the exporter's judgements never
    rendered) or **Run κ report** (diff the returned bundle against the
    live project).
  - The report: a κ hero with Landis & Koch (1977) band, raw vs
    chance-expected agreement, per-rater decision tallies, disagreement
    rows with both reasons quoted side by side, "only they screened" /
    "only I screened" / "in their bundle, never queued here" sections,
    a Feinstein & Cicchetti (1990) paradox note, and Copy/Download as
    Markdown. κ is computed only over papers both raters actually
    screened — unscreened papers never inflate it.
  - Blind imports create real projects with real paper records (deduped
    by id), so a seminar group can run the entire Covidence-style
    dual-screening workflow on files passed by email or the LMS — no
    server, no accounts, preserving the local-first trust model.

### Fixes & engineering

- **Mobile overflow (real bug, caught by VLM QA + DOM measurement):** the
  reader's new header tickets used `hidden sm:inline-flex`, but the
  design system's unlayered `.ticket { display: inline-flex }` beats
  Tailwind's layered display utilities in the cascade — the ticket
  rendered on 390px phones and pushed the reader to 405px. Fixed by
  making the panel headers wrap (`flex-wrap`) and keeping the tickets
  always visible (they wrap gracefully); the cascade gotcha is now
  documented in `globals.css` at the `.ticket` definition.
- **Stat-strip layout in narrow columns:** the approachability panel's
  stat strip went 4-across at ~106px/cell and clipped labels; it is now a
  2×2 grid — measured 224px/cell, zero overflow.
- κ report completeness: papers present in a returned bundle but never
  queued in the local project were silently invisible to the report —
  added a "not queued here" section instead.
- **Styling detail round:** shared `.bench-scroll` thin flat scrollbars
  applied across every in-panel scroll list (κ report, ask thread,
  screening queue, inbox, stance snippets, PDF page pane, review
  browser, suggested topics); `<summary>` disclosure focus rings; a
  prose-link style for bare anchors; a `stampIn` animation for the κ
  value (reduced-motion safe); print rules for gloss cards, seminar
  steps, and diff rows.

### Verification

- Contract tests (curl): real abstract → rewrite with all 6 terms kept
  verbatim + both numbers intact (28.4, 2014); identical request → cache
  hit; terms absent from the abstract → `no-terms` abstain.
- κ math unit vectors: perfect agreement → κ = 1; lopsided 80% raw
  agreement → κ = 0.444 (the paradox, correctly quantified); textbook
  5-pair case → κ = 0.545; empty and degenerate single-category cases →
  `null` with honest UI copy.
- E2E (agent-browser): jargon panel on the real Attention abstract —
  grade 16.2 "Graduate research", 9 highlighted terms, lossless
  segmentation, glossary render; UI rewrite → "Verified · 7 terms kept ·
  6 numbers intact · Grade 16 → 13.2"; seminar export → bundle toast;
  peer bundle upload → explicit blind-vs-κ dialog → κ report (κ = 0.00
  slight, 1 disagreement with both reasons, peer-added paper surfaced) →
  blind import → new seminar project with decisions wiped and paper
  records created; stampIn animation observed on the κ value.
- Regression: live search (20 records + telemetry), all reader panels
  (PDF/ask/stance/focus), review badge, theme round-trip (light↔dark),
  mobile 390px zero horizontal overflow (reader with both new panels
  open, seminar tab), zero console errors, `bun run lint` clean.
- VLM visual QA: jargon panel light + dark, κ report, seminar tab light,
  dark + mobile — production-ready (one false-positive "missing stat
  cards" on mobile was a viewport-crop artifact; DOM-measured PASS).

---

## v3.5 - the synthesis layer

### New features

- **Argument Builder**.
  - Workspace schema v3: new top-level `claims[]` — `{ id, text, notes,
    evidence: [{ evidenceId, stance, note }], createdAt, updatedAt }`;
    stances are `support | qualify | contradict`. v1/v2 states upgrade
    transparently in the normalizer (claims prune their attachments when
    evidence is deleted — a deleted receipt can't back anything).
  - `src/lib/workspace/argument.ts` (pure): `claimStatus` (unbacked /
    supported / qualified / contested), `stanceTally`, `coverageReport`
    ("what a marker would circle"), `coverageScore`, `buildOutline` —
    the Markdown export with stance-ordered sections, verbatim quotes,
    author-year citations with DOI links, page anchors, per-attachment
    notes, and a closing coverage report.
  - `builder-view.tsx` — two-pane desk: claim composer (Enter adds), claim
    cards with a cyan "beam" header, status stamps, stance tally tickets,
    and receipts hanging below with stance-coloured spines; the evidence
    pool (right, sticky, filterable) attaches to the *selected* claim with
    one click (per-row badges show which claims a receipt already backs,
    C1·C2 style); per-attachment notes; inline two-step claim deletion.
    Export panel: outline preview, Copy .md, Download .md.
  - Nav: `09 / Argument builder` with a live badge counting unbacked
    claims.
- **Reproducibility labels**.
  - `memberSchema.repro` — tri-state checklist `code/data/seeds`
    (yes / no / not-checked) plus a `license` string; rendered in the
    screening queue as cycling chips + license field.
  - Desk derives `reproByPaperId` (most complete checklist across
    projects wins) for the Library card badge ("Repro 2/3", tooltip with
    per-item detail) and the Compare matrix row ("2/3 rerunnable",
    C✓ D✓ S✗, license ticket, "not checked" for unchecked columns).
  - `screeningCSV` gains four repro columns.

### Fixes & engineering

- **Local-first sync hardening:** `use-workspace` now merges the optional
  relay snapshot with `mergeWorkspace` (local-authoritative, additive)
  instead of the old `papers.length >=` replace heuristic — a stale relay
  snapshot can no longer clobber locally captured work (papers,
  evidence, claims) after a relay restart or offline session.
- Caught in self-review: a Tailwind class (`overflow-y-auto`) pasted into
  plain CSS broke every route during development — fixed before E2E.
- Print styles cover the new claim cards; `prefers-reduced-motion`
  disables the pool-row lift and receipt transitions.

### Verification

- E2E (agent-browser): claim created ("Unbacked") → selected → evidence
  attached from the pool → "Backed / 1 sup" → stance flipped to contradict
  → "Contested" → coverage warning card rendered with jump-to-claim links
  → outline preview contains the claim, verbatim quote, and citation;
  reload → claim + stance + attachment persist (schema v3 in storage);
  detach → empty hint; two-step delete → board empty state.
- Repro E2E: tri-state chips cycled (code ✓, data ✓, seeds ✗), license
  committed on blur → member.repro persisted → Library card shows
  "Repro 2/3" → Compare row shows "2/3 rerunnable · C✓ D✓ S✗ · MIT".
- Regression: live search (20 records), reader panels, grounded Q&A
  ("Grounded · 2 verified"), review badge, theme toggle round-trip,
  mobile 390px (no horizontal overflow, 9 tab pills), zero console
  errors; `bun run lint` clean. VLM QA: builder light/dark/mobile all
  production-ready (no overlap, contrast, or alignment issues).

---

## v3.4 - grounded Q&A

### New features

- **Grounded AI Q&A**.
  - `POST /api/ask` (zod-validated, rate-limited 10/min, 30s model
    timeout, in-memory answer cache keyed by sources-hash + question):
    the client sends only the paper's own sources (abstract as page 0 +
    extracted PDF pages); the server retrieves question-relevant chunks
    (`matchingPassages`), asks the model strictly from them, and then
    **re-verifies every returned quote as an exact substring** of a
    retrieved passage (`groundedQuotes`).
  - The no-hallucination contract: an answer with zero verified quotes
    never ships — the route abstains (`unsupported`); questions whose
    terms match nothing skip the model entirely (`no-relevant-passages`);
    unverified model quotes are dropped and the drop count is disclosed.
  - Reader gains **Ask the paper** (magenta accent — the AI surface is
    visually distinct from the ink-and-paper work surfaces): question
    input, four suggested questions, an in-panel thread, grounded
    tickets ("GROUNDED · N VERIFIED"), clickable verbatim receipts that
    scroll to the source and flash it (`source-flash` animation),
    "Copy as Markdown" per answer, and honest ABSTAINS cards.

### Fixes & engineering

- Retrieval model quality: quotes are verified against the exact chunk
  set shown to the model, so the verifier can never "pass" text the
  model never saw.
- One strict JSON retry on malformed model output before abstaining.
- `prefers-reduced-motion` now also disables the source-flash animation
  and receipt hover-lift.

### Verification

- Contract tests (curl, controlled passages): answerable question →
  answer + verbatim quote; identical ask → cache hit (19 ms vs 1.4 s);
  unrelated question → `no-relevant-passages`; term-matching but
  unanswerable ("who funded it / what license") → `unsupported` — the
  model was offered passages and the guard refused to let it guess.
- E2E (agent-browser): panel opens, suggested chips work, live question
  on a real paper → "GROUNDED · 2 VERIFIED" with receipts; receipt click
  scrolls to the abstract and flashes (`.source-flash` observed in DOM);
  unanswerable question → ABSTAINS card rendered; zero console errors;
  VLM QA clean in light + dark; no overflow at 390px.

---

## v3.3 - the full-text layer

### New features

- **PDF upload with page-anchored evidence**.
  - `POST /api/extract`: multipart upload (≤ 15 MB, ≤ 500 pages, 24k
    chars/page), server-side SHA-256, `unpdf` extraction; magic-byte
    validation rejects non-PDFs; extraction failures (encrypted/scanned
    PDFs) return honest 422 messages.
  - The Reader gains a **Full text (PDF)** panel: drag-and-drop or browse,
    page navigator (prev/next + jump), and a selectable text pane.
    Highlighting a passage auto-targets the capture panel with
    `documentId` + `page`; a source toggle (Abstract / PDF · p.N) keeps the
    verbatim check honest against the exact page.
  - Evidence records carry a `PDF · p.N` ticket; the verifier re-checks
    page-anchored quotes against the stored page text on every relay sync.
  - Removing or replacing a PDF cascades-deletes its anchored evidence
    (with an inline confirmation that states the cost) — those verbatim
    checks could never pass again.
- **Smart citations — supporting / contrasting / mentioning**.
  - `GET /api/citations?…&contexts=1` returns the citation contexts
    (sentences in which later papers cite this one) from Semantic Scholar,
    reusing the existing identifier fallback chain (S2 id → arXiv → DOI →
    PMID → title search).
  - `lib/academic/stance.ts`: a fully transparent heuristic classifier —
    contrast markers take precedence over agreement markers, everything
    else is mentioning. The complete rule list ships in the UI disclosure,
    taxonomy after scite.ai (Nicholson et al., 2021).
  - "How is this cited?" panel in the Reader: tally tickets, stance filter
    chips, snippet list with citing paper + year + S2 link, and the
    method note for citation in coursework.
- **Focus sessions & reading streaks**.
  - **Focus** chip in the Reader masthead starts a 25-minute session
    overlay (pause/resume/end, live countdown ring, per-session capture
    tally, completion toast).
  - **Desk activity** card in Review: a 12-week GitHub-style heat calendar
    (captures + grades + screening decisions), today outlined in orange,
    a desk-streak ticket, and a daily capture goal (1/3/5/7/10, persisted
    locally) with a progress bar.
  - All activity is *derived* from existing timestamps
    (`evidence.createdAt`, `events.createdAt`, `reviewLog.at`) — zero
    schema change, zero double bookkeeping.

### Fixes & engineering

- `pdf.js` may detach the upload buffer during extraction; the SHA-256 is
  now computed *before* extraction (previously it silently hashed empty
  input on the Node path).
- Extracted `toS2IdCandidates` into `lib/academic/ids.ts`, shared by the
  citation map and the stance panel (was duplicated in graph-view).
- The daily goal is read through `useSyncExternalStore` (server snapshot
  = default) — hydration-exact and lint-clean.
- Reader state fully resets when switching papers (quote input, source,
  active page, focus session).

### Verification

- E2E (agent-browser): upload → 2 pages extracted; verbatim capture from
  page 1 → `PDF · p.1` ticket, persisted `documentId` + `page` in
  localStorage; stance panel live (0 supporting · 1 contrasting · 9
  mentioning on *Attention Is All You Need*), Contrast filter → 1
  snippet, method disclosure renders; focus countdown ticks, pause freezes
  it, end closes the overlay; activity calendar + goal render and the goal
  survives reload; no horizontal overflow at 390px; dark mode clean; no
  console errors; `bun run lint` passes.

---

## v3.2 - the learning layer

### New features

- **07 · Review — evidence flashcards with spaced repetition.**
  - Every captured evidence item is a card by definition (no separate card
    store): the front is the field + paper, the back is the statement
    (verbatim for author passages).
  - Full **SM-2 scheduler** (`src/lib/workspace/srs.ts`): ease factors,
    geometric intervals, lapse handling, ±5% interval fuzz so batches
    don't pile onto one day.
  - Grade buttons preview the next interval before you commit.
  - Stats strip: due now, cards total, streak (consecutive active days),
    and 30-day recall rate — all derived from a persisted `reviewLog`.
  - Card browser with suspend/resume per card; deleting the evidence in
    the Reader removes the card for good (schedules auto-prune).
- **08 · Citation map — force-directed explorer.**
  - New `GET /api/citations` route (zod-validated, 30/min rate limit)
    wrapping the existing Semantic Scholar citation-graph fetch.
  - Identifier fallback chain: S2 id → arXiv → DOI → PubMed → best-match
    **title search** (rescues records with placeholder proceedings DOIs
    that Semantic Scholar never indexed), with a transparent “matched by
    title” notice.
  - d3-force layout (pre-ticked, deterministic render), refs in cyan /
    cited-by in orange, node size ∝ citations, green dot for open-access
    PDFs. Click to inspect; double-click to re-center; export standalone
    SVG. Honest error states for rate-limits and unindexed records.
  - **Map citations** button in the Reader jumps straight into the map.
- **Workspace schema v2** — adds `reviews` (SM-2 schedules) and
  `reviewLog` (graded attempts); v1 states upgrade automatically in the
  normalizer (no data loss, no migration step). The server relay accepts
  both versions.

### Fixes & polish

- **Locked repositories are readable now** — key-gated provider rows in
  the Discover rail previously rendered at `opacity-45`, effectively
  invisible on Solarized Light. They now keep full ink text on a soft
  hatch pattern with a yellow key stamp (and explain themselves on hover).
- Placeholder text contrast raised (`--ink-muted`), light-mode faint ink
  darkened (`#a9b2af` → `#8a9a97`), nav count badges switched from heavy
  ink to the cyan accent.
- Citation-provider 429s now surface a human explanation
  ("rate-limiting… try again in a minute") instead of a raw HTTP code.

### Dependencies

- Added `d3-force` (+ types) for the citation map layout.

---

## v3.1 - import & PRISMA

- **BibTeX / RIS import** — paste or drop a `.bib` / `.ris` / EndNote file
  in the Library; a forgiving parser normalizes entries into workspace
  records using the same `doi:` id convention as live results, so a later
  Crossref hit merges instead of duplicating. New-vs-known records are
  previewed before commit (`src/lib/workspace/bib-import.ts`).
- **PRISMA-style flow diagram** — one button on the Projects view derives
  identification / deduplication / screening / inclusion counts from the
  workspace's real search history and the project's screening decisions,
  renders the diagram as standalone Solarized SVG, and offers "Download
  SVG" + "Copy counts as text" for methods sections
  (`src/lib/workspace/prisma-flow.ts`).

---

## v3.0 - the Solarized redesign

### Design system — "The Paper Bench"

| Aspect | Before (v2) | Now (v3) |
| ------ | ----------- | -------- |
| Theme | Hard-coded dark "obsidian" with emerald neon glows | **Solarized Light** (warm paper `#fdf6e3`, default) + **Solarized Dark** (deep harbour `#002b36`), toggleable |
| Palette | Emerald / jade / terracotta glows | Canonical **Solarized accents** — cyan, green, yellow, orange, magenta, violet, red (no blue anywhere) |
| Typography | Fraunces serif + Inter + JetBrains Mono | **Bricolage Grotesque** (display) + **Atkinson Hyperlegible** (body — designed for maximum legibility, ideal for long reading sessions) + **IBM Plex Mono** (data/labels) |
| Surfaces | Glassy translucent cards, glow shadows, bracketed corners | Flat **2px ink borders, hard offset press-shadows**, sharp 2px corners — index slips on a desk |
| Badges | Glowing HUD pills | Flat **stamp tickets** with punched dots |
| Layout | Top masthead + bottom mobile nav | **Left sidebar rail** (desktop) + scrollable top tab strip (mobile), sticky footer |
| Hero | "Find the literature that matters." | **"The research desk that keeps its receipts."** with marker-highlighted headline |
| Empty states | Plain cards | **Engineering hatching** pattern (also used for missing-evidence matrix cells) |
| Loader | Quantum spinner | **Shuffling paper-stack** loader |
| Custom cursor | Ambient glow cursor follower | Removed (native pointer, cleaner feel) |

### Kept from the previous edition

- The **floating scientific-manuscripts background** (canvas motion,
  cursor parallax, citation filaments) — now theme-aware: it re-reads the
  Solarized palette whenever you flip light/dark.

### New features & fixes

- **Light/dark theme toggle** (sidebar & mobile top bar) with persistence —
  light mode is canonical **Solarized Light**, dark mode is Solarized Dark.
- **Alerts "Check now"** — standing queries can be swept on demand without
  any background worker; new records are delivered into the local inbox,
  `lastRunAt` and seen-IDs are updated (bounded to the schema limits).
- **Search filters actually reach the API** — year range, open-access, and
  min-citation filters are now nested under `filters` in the request body
  as the zod contract expects (previously they were silently dropped).
- **Sort control works** — relevance / newest / most-cited sorting is now
  applied to result snapshots (previously the dropdown did nothing).
- **Source telemetry renders** — the per-source status panel now consumes
  the API's `sources` array (previously it read a non-existent
  `diagnostics` field and never displayed).
- **Hydration-safe boot** — the workspace hydrates from localStorage after
  mount instead of during first render, eliminating React hydration
  mismatch warnings.
- **Reduced motion & keyboard focus** — `prefers-reduced-motion` respected
  by the canvas; visible cyan focus rings throughout.

### Optional configuration

All keys stay on the server (see [`.env.example`](./.env.example)); none
are required to run the desk:

| Variable | Purpose |
| --- | --- |
| `LLM_API_KEY` | Switch on the two AI surfaces (grounded Q&A + plain-language rewrite). Any OpenAI-compatible endpoint. |
| `LLM_BASE_URL` | The endpoint's base URL (default `https://api.openai.com/v1`; e.g. `http://localhost:11434/v1` for Ollama) |
| `LLM_MODEL` | The chat model to use (default `gpt-4o-mini`) |
| `ACADEMIC_CONTACT_EMAIL` | Your real optional contact email for provider requests |
| `OPENALEX_API_KEY` | Enable the optional OpenAlex adapter |
| `SEMANTIC_SCHOLAR_API_KEY` | Enable Semantic Scholar search and citation requests |
| `IEEE_API_KEY` | Enable IEEE Xplore |
| `CORE_API_KEY` | Enable CORE v3 |

---

