# Contributing to Kivo

Thanks for your interest in improving Kivo — The Evidence Desk.

## Development setup

```bash
# 1. Clone & install (Node 22+ or Bun 1.1+)
git clone https://github.com/Pratham2511/Kivo-Research-Discovery-Workspace.git
cd Kivo-Research-Discovery-Workspace
bun install          # or: npm install

# 2. (Optional) configure extras — the app runs with no setup at all
cp .env.example .env # then edit if you want an AI provider or extra sources

# 3. Start the dev server
bun run dev          # http://localhost:3000
```

No database and no API keys are required: the workspace is browser-first
(localStorage), and the default academic sources (Crossref, arXiv, Europe
PMC) are key-free.

## Code style

- **TypeScript everywhere**, strict mode. Run `bun run typecheck` before
  pushing.
- **ESLint** must pass: `bun run lint`.
- Prefer the existing design-system classes in `src/app/globals.css`
  (`.bench-card`, `.paper-slip`, `.ticket-*`, `.stat-cell`, …) over ad-hoc
  Tailwind chains for new surfaces — that is what keeps the desk visually
  coherent.
- Every AI-adjacent feature must keep its verification contract: answers
  only ship with server-verified verbatim quotes; rewrites only ship when
  every term and number survived. See `src/app/api/ask/route.ts` and
  `src/app/api/gloss/route.ts` for the pattern.

## Project map

| Path | What lives there |
| --- | --- |
| `src/app/page.tsx` | The single route — mounts the desk |
| `src/components/workspace/` | Views (discover, reader, library, projects, compare, alerts, review, citation map, builder) |
| `src/lib/academic/` | Academic source adapters, orchestrator, dedup, ranking, citations |
| `src/lib/workspace/` | Schema (zod, versioned), storage engine, exports, SRS, seminar, PRISMA flow |
| `src/lib/reading/` | Readability, jargon lexicon + detection |
| `src/lib/llm.ts` | Provider-agnostic AI client (any OpenAI-compatible endpoint) |
| `src/app/api/` | Routes: search, workspace relay, ask, gloss, citations, extract, health |

## Ground rules

- **Local-first**: the browser is the home of the working set. Nothing a
  server does may overwrite or lose a user's captured work.
- **Honest surfaces**: telemetry, abstentions, refusals and method
  disclosures are features, not error states. If data is missing, show it
  missing.
- **No vendor lock-in**: new integrations should follow the
  provider-agnostic pattern (configure via env, degrade honestly without).

## Submitting changes

1. Fork / branch from `main`.
2. Make your change; add UI in the existing design language.
3. `bun run lint && bun run typecheck` must pass.
4. Open a pull request describing what changed and how you verified it in
  the browser (the README's Verification sections show the expected depth).

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, which
theme (Solarized Light/Dark), and the browser + viewport. Console output
helps.
