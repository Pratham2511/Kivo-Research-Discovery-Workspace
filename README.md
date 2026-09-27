# KIVO — The Evidence Desk

[![CI](https://github.com/Pratham2511/Kivo-Research-Discovery-Workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratham2511/Kivo-Research-Discovery-Workspace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Bun](https://img.shields.io/badge/runtime-Bun-fbf0da.svg)](https://bun.sh/)

A **local-first research workbench** for finding scholarly records, keeping
source passages, and organizing a literature review — all in the browser.
Retrieval talks to real academic APIs directly (Crossref, arXiv, Europe PMC
by default; Semantic Scholar, OpenAlex, IEEE, CORE when keys are provided),
evidence is captured with **page-anchored verbatim quotes**, and the workspace
is persisted in `localStorage` / `IndexedDB` — **no database, no accounts, no
API keys required to start**. The two AI surfaces (grounded Q&A and a
plain-language rewrite) are optional and talk to any OpenAI-compatible
endpoint; with no provider configured they abstain honestly instead of
guessing.

> Solarized Light & Dark themes · single-page workspace · zero-config run

---

## Table of contents

- [Quick start](#quick-start)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Verification](#verification)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)
- [Credits](#credits)

---

## Quick start

```bash
git clone https://github.com/Pratham2511/Kivo-Research-Discovery-Workspace.git
cd Kivo-Research-Discovery-Workspace
bun install          # or: npm install
bun run dev          # http://localhost:3000
```

That's it. No database, no Docker, no API keys required — the workspace is
browser-first, and the three default academic sources (Crossref, arXiv,
Europe PMC) are key-free. To enable the optional AI surfaces or any of the
key-gated academic providers, see [Configuration](#configuration).

### Requirements

- **Node 22+** or **Bun 1.1+** (Bun is the canonical runtime; `bun.lock` is
  the source of truth for installs).
- Internet access for live academic search and PDF extraction.

---

## Features

The workspace is a single page with nine sections, navigated via a sidebar
(desktop) or tab strip (mobile).

### 01 · Discover
Search academic sources by topic, quoted phrase, title, DOI, or arXiv ID.
Live per-source telemetry, explicit filters (year range, open access, min
citations, paper type), sort by relevance / newest / most-cited, recent
searches, and suggested topics. Ranking is by title/text relevance — never
by citation counts or prestige.

### 02 · Reader
Inspect the abstract, upload a PDF (≤15 MB) with page-anchored selection,
and capture any passage as evidence into one of nine fields (Question,
Method, Dataset/sample, Evaluation, Metrics, Findings, Limitations,
Code/data, Notes). Each evidence record carries an `Abstract` or
`PDF · p.N` ticket so its origin is always visible. Three sub-panels:

- **How is this cited?** — pulls Semantic Scholar citation contexts and
  classifies each as **supporting / contrasting / mentioning** via a
  transparent heuristic whose rule list is shown in the UI.
- **Ask the paper** — grounded Q&A. Answers ship only with server-verified
  verbatim quotes; otherwise the panel abstains. Clickable receipts
  scroll-and-flash the source passage.
- **Make it approachable** — Flesch–Kincaid reading grade, a jargon
  heatmap over a bundled ~130-term lexicon (hover any highlight for its
  plain-language gloss), and an AI plain-language rewrite that only ships
  when the server has mechanically verified every term and every number
  survived.

### 03 · Library
Saved papers with search/sort, BibTeX / RIS import (paste or drop a file),
and exports (BibTeX, RIS, evidence CSV, full library JSON).

### 04 · Projects
PRISMA-style screening queue with include / exclude / maybe decisions and
reasons, an audit trail of every event, a reproducibility checklist
(code / data / seeds / license), reading status, tags, and notes. Three
tabs:

- **Screening** — per-paper decisions with reproducibility labels.
- **PRISMA diagram** — one-button SVG flow diagram built from real
  screening counts, plus "Copy counts as text".
- **Seminar · peer κ** — three-step rail: export your screening as a
  self-contained JSON bundle → a classmate screens blind (your decisions
  are wiped) → import their bundle to get a **Cohen's κ** agreement
  report with Landis & Koch interpretation bands, per-paper reason diffs,
  and Markdown export for seminar minutes.

### 05 · Compare
Up to eight papers side-by-side as an evidence matrix. Hatched cells mark
missing evidence; a reproducibility row summarizes availability across the
set.

### 06 · Alerts
Standing queries with daily / weekly frequency. "Check now" sweeps the
configured repositories on demand; new records land in the local inbox
with unread badges.

### 07 · Review
SM-2 spaced-repetition flashcards. Every captured evidence item becomes a
card (field + paper = front, statement = back). Grade buttons preview the
next interval. Stats: due now, total cards, current streak, 30-day recall,
plus a 12-week GitHub-style activity calendar with a daily capture goal.

### 08 · Citation map
A `d3-force` graph of a paper's references (cyan) and citations (orange),
sized by citation count, with a green dot for open-access PDFs. Click to
inspect, double-click to re-center, export as standalone SVG.

### 09 · Argument builder
Toulmin-style claims with stanced evidence attachments
(support / qualify / contradict). Live status stamps
(unbacked / supported / qualified / contested), a coverage report ("what
a marker would circle"), and a Markdown outline export with verbatim
quotes, author-year citations, and page anchors. A nav badge counts
unbacked claims.

### Design principles

- **Local-first** — the browser is the home of the working set. Nothing
  a server does may overwrite or lose a user's captured work.
- **Honest surfaces** — telemetry, abstentions, refusals, and method
  disclosures are features, not error states. Missing data is shown
  missing, never fabricated.
- **No vendor lock-in** — every integration follows the
  provider-agnostic pattern: configure via env, degrade honestly without.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, `output: "standalone"`) |
| UI runtime | React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + `tailwindcss-animate` + `tw-animate-css` |
| Components | Radix UI dialog + a shadcn-style dialog/toaster pair |
| Icons | lucide-react |
| Animation | Custom canvas background (`research-background.tsx`) |
| Validation | zod 4 |
| Graphs | d3-force (citation map) |
| PDF extraction | unpdf (server-side, page-by-page) |
| State | React `useState` (no global store needed) |
| Persistence | `localStorage` (sync cache) + `IndexedDB` (workspace) |
| AI client | hand-rolled OpenAI-compatible `fetch` wrapper (`src/lib/llm.ts`, ~116 lines) |
| Runtime (prod) | Bun |
| Lint / type-check | ESLint 9 + `eslint-config-next`, `tsc --noEmit` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (single page — src/app/page.tsx mounts <Desk/>)           │
│                                                                  │
│  ┌─────────────────┐   ┌─────────────────┐   ┌───────────────┐  │
│  │ Workspace shell │──▶│ 9 feature views  │──▶│ Local state   │  │
│  │ (sidebar/tabs)  │   │ (src/components/ │   │ + use-workspace│  │
│  └─────────────────┘   │  workspace/)     │   │ hook          │  │
│                        └─────────────────┘   └──────┬────────┘  │
│                                                     │           │
│                              ┌──────────────────────┴───────┐   │
│                              ▼                              ▼   │
│                  ┌────────────────────┐         ┌────────────────┐│
│                  │ localStorage       │         │ IndexedDB      ││
│                  │ (sync cache v1)    │         │ (workspace)    ││
│                  └────────────────────┘         └────────────────┘│
└──────────────────────────────┬───────────────────────────────────┘
                               │ fetch (JSON, multipart)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Next.js API routes (src/app/api/)                                │
│                                                                  │
│  /search    ──┐                                                  │
│  /citations ──┤──▶ Academic orchestrator ──▶ Crossref, arXiv,   │
│  /extract   ──┤    (src/lib/academic/)        Europe PMC, S2,    │
│  /ask       ──┤                                OpenAlex, IEEE,   │
│  /gloss     ──┤                                CORE             │
│  /workspace ──┤                                                  │
│  /health    ──┘                                                  │
│                                                                  │
│  Verifier (src/lib/workspace/grounding.ts, prisma-flow.ts,      │
│  srs.ts, seminar.ts, argument.ts, reading/*)                    │
└──────────────────────────────────────────────────────────────────┘
```

**Key design points:**

1. **Browser-authoritative.** `/api/workspace` is a no-op relay by design
   — GET returns an empty workspace, PUT validates and acknowledges
   without persisting. The browser is the single source of truth.
2. **No-hallucination contract for `/api/ask`.** The client sends only the
   paper's verbatim sources (abstract + PDF pages). The server retrieves
   question-relevant chunks, asks the model strictly from them, then
   re-verifies every returned quote is an exact substring of a retrieved
   passage. Zero verified quotes ⇒ abstain with a stated reason.
3. **No-distortion contract for `/api/gloss`.** The model rewrites the
   abstract for a second-year student; the server mechanically verifies
   every detected term and every number/year from the original survived.
   One strict retry naming missing pieces, then honest refusal.
4. **Provider-agnostic AI.** `src/lib/llm.ts` speaks the standard OpenAI
   `/chat/completions` protocol over `fetch`. Works with OpenAI, Groq,
   Together, Mistral, DeepSeek, OpenRouter, or a local Ollama / llama.cpp
   server.
5. **Security guards.** `src/lib/security.ts` provides rate limiting,
   body-size guards, SSRF protection, and input sanitization used by every
   API route.

---

## Project structure

```
Kivo-Research-Discovery-Workspace/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout: fonts, ThemeProvider, Toaster
│   │   ├── page.tsx                  # Single route — mounts <Desk/>
│   │   ├── globals.css               # Solarized design system ("The Paper Bench")
│   │   └── api/
│   │       ├── health/route.ts        #   GET  — health + AI provider label
│   │       ├── search/route.ts        #   POST — academic search across 1–7 providers
│   │       ├── extract/route.ts       #   POST — PDF upload → per-page text (unpdf)
│   │       ├── citations/route.ts     #   GET  — Semantic Scholar graph + contexts
│   │       ├── workspace/route.ts     #   GET/PUT — workspace relay (no-op by design)
│   │       ├── ask/route.ts           #   POST — grounded Q&A (no-hallucination)
│   │       └── gloss/route.ts         #   POST — plain-language rewrite (no-distortion)
│   │
│   ├── components/
│   │   ├── desk/
│   │   │   ├── desk.tsx               #   Top-level orchestrator (~1174 lines)
│   │   │   ├── use-workspace.ts       #   Hook: localStorage hydrate + relay sync
│   │   │   └── research-background.tsx #   Canvas animation (floating papers)
│   │   │
│   │   ├── workspace/                 #   9 feature views + shared panels
│   │   │   ├── workspace-shell.tsx    #     Sidebar nav + mobile tabs
│   │   │   ├── discover-view.tsx      #     01 Discover
│   │   │   ├── reader-view.tsx        #     02 Reader
│   │   │   ├── saved-view.tsx         #     03 Library
│   │   │   ├── projects-view.tsx      #     04 Projects (PRISMA + seminar)
│   │   │   ├── compare-view.tsx      #     05 Compare
│   │   │   ├── updates-view.tsx       #     06 Alerts
│   │   │   ├── review-view.tsx        #     07 Review (SM-2 flashcards)
│   │   │   ├── graph-view.tsx         #     08 Citation map
│   │   │   ├── builder-view.tsx       #     09 Argument builder
│   │   │   └── *.tsx                  #     Panels: stance, ask, jargon, focus, …
│   │   │
│   │   ├── ui/                         #   Radix dialog + sonner toaster (only)
│   │   ├── theme-provider.tsx
│   │   └── theme-toggle.tsx
│   │
│   └── lib/
│       ├── academic/                  #   Academic retrieval layer
│       │   ├── orchestrator.ts        #     searchMultipleSources + PROVIDERS map
│       │   ├── query.ts                #     prepareQuery + DOI/arXiv identifier detection
│       │   ├── rank.ts                 #     applyFilters + rankPapers
│       │   ├── dedup.ts                #     deduplicatePapers (DOI/arXiv/title+year+author)
│       │   ├── http.ts                 #     bounded, serialized, abortable providerFetch
│       │   ├── ids.ts                  #     S2 id → arXiv → DOI → PMID fallback
│       │   ├── citations.ts            #     fetchCitationGraph + fetchCitationContexts
│       │   ├── stance.ts               #     transparent smart-citation classifier
│       │   ├── types.ts                #     AcademicPaper, SearchFilters, …
│       │   └── sources/                #     Provider adapters (7 wired + 2 scaffolded)
│       │
│       ├── workspace/                 #   Workspace engine
│       │   ├── schema.ts              #     Zod workspaceSchema v3
│       │   ├── repository.ts           #     IndexedDB repository + normalize/merge
│       │   ├── storage-engine.ts       #     localStorage sync cache
│       │   ├── exports.ts              #     BibTeX, RIS, CSV exports
│       │   ├── bib-import.ts           #     forgiving BibTeX + RIS parser
│       │   ├── srs.ts                  #     SM-2 spaced repetition
│       │   ├── argument.ts             #     Toulmin claims + outline export
│       │   ├── seminar.ts              #     seminar bundle + Cohen's κ
│       │   ├── prisma-flow.ts          #     PRISMA 2020 flow counts
│       │   ├── grounding.ts            #     matchingPassages + groundedQuotes
│       │   ├── alerts.ts               #     incremental alert sweep
│       │   └── activity.ts             #     daily activity + streak
│       │
│       ├── reading/                    #   Reading-level layer
│       │   ├── lexicon.ts              #     ~130-term jargon glossary
│       │   ├── readability.ts          #     Flesch–Kincaid grade
│       │   └── jargon.ts               #     detectJargon + segmentAbstract
│       │
│       ├── llm.ts                      #   Provider-agnostic OpenAI-compatible client
│       ├── security.ts                 #   Rate limit + body-size + SSRF + sanitize
│       └── utils.ts                    #   cn() Tailwind class merger
│
├── public/                             #   logo.svg, robots.txt
├── docs/screenshots/                   #   README screenshots
├── .github/workflows/ci.yml            #   CI: lint + typecheck on push/PR
├── .env.example                        #   All optional env vars documented
├── CONTRIBUTING.md                     #   Dev setup, code style, project map
├── CHANGELOG.md                        #   Release notes (v3.0 → v3.7)
├── LICENSE                             #   MIT
└── README.md                           #   ← you are here
```

---

## Configuration

Kivo runs with **zero configuration**. Every environment variable below is
optional. Copy `.env.example` to `.env` to enable any of them.

### AI surfaces (optional)

The two AI surfaces (grounded Q&A in the reader, plain-language rewrite in
the reading-level panel) talk to any OpenAI-compatible chat-completions
endpoint. Without these variables the surfaces abstain honestly; every
other feature works unchanged.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_API_KEY` | _(unset)_ | Switch on the AI surfaces. Any non-empty string works for local servers (Ollama). |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible base URL. |
| `LLM_MODEL` | `gpt-4o-mini` | Any chat model the endpoint serves. |

Aliases: `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` are also
accepted.

**Local Ollama example** (no cloud, no cost):

```bash
LLM_API_KEY=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
```

### Academic sources (optional)

Search and the citation map work without any key (shared public pool).
The three default sources — **Crossref**, **arXiv**, **Europe PMC** — are
always on. The following keys lift rate limits or unlock additional
providers.

| Variable | Provider | Where to get a key |
| --- | --- | --- |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar (search + citation graph) | https://www.semanticscholar.org/product/api |
| `OPENALEX_API_KEY` | OpenAlex | https://docs.openalex.org/ |
| `CORE_API_KEY` | CORE v3 | https://core.ac.uk/services/api |
| `IEEE_API_KEY` | IEEE Xplore MetaProxy | https://developer.ieee.org/ |
| `ACADEMIC_CONTACT_EMAIL` | Polite-pool mailto for Crossref / OpenAlex | Your email address |

---

## Deployment

### Standalone build (self-hosted)

`next.config.ts` sets `output: "standalone"`, producing a self-contained
server bundle designed for self-hosting on a VM or container.

```bash
bun run build              # produces .next/standalone/ + copies static + public/
bun run start              # NODE_ENV=production bun .next/standalone/server.js
```

The build step copies `.next/static` and `public/` into the standalone
bundle so the server can serve them directly.

### Runtime

The production runtime is **Bun** (per the `start` script). Node 22+
should also work for the standalone server but is not the canonical
runtime.

### CI

`.github/workflows/ci.yml` runs on every push to `main` and on every pull
request:

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run typecheck`

The workflow does not run `next build` — verification beyond lint and
type-check is browser-based (see [Verification](#verification)).

---

## Verification

Every release was verified by hand in the browser against the contract
that defines it. The expected depth is documented per release in
[CHANGELOG.md](CHANGELOG.md).

For contributors, the minimum bar before opening a pull request is:

```bash
bun run lint
bun run typecheck
```

Then exercise the affected surface in the browser (Solarized Light and
Solarized Dark) and confirm the honesty contracts hold:

- **`/api/ask`** — answers ship only with server-verified verbatim quotes;
  with no provider configured the panel shows the `not-configured` reason.
- **`/api/gloss`** — rewrites ship only when every term and number
  survived; missing pieces are named in the refusal.

---

## Contributing

Contributions are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, code style,
project map, and the ground rules (local-first, honest surfaces,
no vendor lock-in).

Short version:

1. Fork / branch from `main`.
2. `bun run lint && bun run typecheck` must pass.
3. Open a pull request describing what changed and how you verified it in
   the browser.

---

## Changelog

Release notes for every version — v3.0 (Solarized redesign) through
v3.7 (provider-agnostic AI) — live in [CHANGELOG.md](CHANGELOG.md). The
most recent release is listed first.

---

## License

[MIT](LICENSE) © 2025 Pratham2511

---

## Credits

- **Solarized palette** by Ethan Schoonover — the design system's foundation.
- **Solarized Light & Dark** themes throughout the desk.
- Academic data by **Crossref**, **arXiv**, **Europe PMC**, **Semantic
  Scholar**, **OpenAlex**, **IEEE**, and **CORE**.
- UI primitives by **Radix UI** and **shadcn/ui**.
- Type setting: **Bricolage Grotesque** (display), **Atkinson Hyperlegible**
  (body), **IBM Plex Mono** (data).
