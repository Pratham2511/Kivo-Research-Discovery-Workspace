# Kivo architecture

Kivo is a Next.js App Router application with a browser-owned research workspace. The Next.js server supplies scholarly retrieval, citations, and optional reading APIs. There are no accounts or cloud database-backed workspaces.

## Code map

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Landing page; forwards search to `/workspace?q=...` |
| `src/app/workspace/page.tsx` | Research desk and initial query |
| `src/components/desk/desk.tsx` | Research actions, navigation, search snapshots, and exports |
| `src/components/desk/use-workspace.ts` | Hydration and serialized workspace writes |
| `src/components/workspace/` | Nine research views and shared reading panels |
| `src/lib/workspace/repository.ts` | IndexedDB repository, legacy migration, and normalization |
| `src/lib/workspace/storage-snapshot.ts` | Shared save timestamps and newest-copy selection |
| `src/lib/workspace/persistence.ts` | Durable writes and fallback/error handling |
| `src/lib/workspace/pdf-browser.ts` | Lazy-loaded local PDF text extraction |
| `src/lib/academic/` | Provider adapters, query handling, deduplication, filtering, ranking, and citations |
| `src/lib/reading/` | Jargon glossary and reading-grade estimates |
| `src/lib/llm.ts` | Optional OpenAI-compatible model client |
| `src/app/api/` | Search, citations, ask, gloss, health, and compatibility endpoints |
| `scripts/` | Regression tests, TypeScript loader, and synthetic PDF fixture |

## Workspace durability

The versioned Zod workspace contains papers, search snapshots, projects, evidence, documents, comparison IDs, alerts, review schedules, screening events, and claims. Mutations clone the latest state, normalize it, validate evidence, and serialize storage writes.

IndexedDB is the primary store. Each save gives IndexedDB and the localStorage fallback the same monotonic timestamp. Hydration chooses the newest durable copy, including a newer fallback written after an IndexedDB failure. Legacy browser keys migrate without discarding a valid newer cache. If both stores fail, the draft stays available in memory and the user receives a backup warning.

The UI does not call `/api/workspace`: that compatibility route validates and acknowledges data without persisting it. Cross-tab reconciliation, cloud sync, and a full backup restore UI remain future work.

## Discovery and source access

The server prepares queries deterministically, calls configured scholarly adapters with deadlines, normalizes metadata, deduplicates records, applies hard filters, and ranks by textual relevance. Search does not require an LLM.

Discover requests up to 150 records and paginates the retrieved snapshot locally in 20-paper pages. All retrieved records are retained in search history. This avoids relying on a single serverless process retaining a cursor session; API cursors remain supported for compatibility callers. A snapshot is bounded and must not be reported as the size of the published literature.

Source controls consume server capabilities. Source-link resolution validates HTTP(S) URLs and official DOI/arXiv identifiers, and distinguishes publisher pages from PDF links. Upstream access metadata cannot guarantee that a publisher will serve a free PDF.

## PDFs, evidence, and optional AI

PDFs are checked for signature and size, hashed, then extracted locally with a lazy-loaded unpdf module. The workspace retains page text, not the binary file. Extraction is capped at 500 pages and 24,000 characters per page; scans without a text layer require OCR. Each attachment has its own document identity.

Author passages must match an abstract or selected PDF page exactly. Researcher notes are stored separately. Captured evidence includes its paper, classification, kind, and optional document/page anchor. Papers referenced by evidence or projects cannot be silently unbookmarked.

Optional Q&A retrieves question-relevant supplied passages, calls a configured model, and verifies returned quotes against those passages. Optional rewriting checks preservation of detected terms and numeric values. These checks improve traceability but are not proofs of semantic correctness. Invoking model-backed features sends supplied source text to the configured provider.

## Boundaries

Citation graphs are bounded at 20 references and 20 citing records per center. Alerts run through manual Check now actions. PRISMA counts derive from saved snapshots and screening state; they are not a project-specific exhaustive retrieval ledger. All browser data is scoped to its origin.

Run lint, TypeScript checks, the regression suite, and a production build before publishing. Browser checks should exercise changed workflows using public or synthetic data.
