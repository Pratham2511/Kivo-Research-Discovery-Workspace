"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Search,
  SlidersHorizontal,
  History,
  Database,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Compass,
  Layers,
  ShieldCheck,
  KeyRound,
  Zap,
} from "lucide-react";
import type { Workspace } from "@/lib/workspace/schema";
import { PaperCard, type Paper } from "./paper-card";

/**
 * Providers aligned to the academic orchestrator. The three default sources
 * (Crossref, arXiv, Europe PMC) operate without API keys; the rest require a
 * configured server credential and are shown but disabled in local mode.
 */
export const AVAILABLE_PROVIDERS = [
  { id: "Crossref", label: "Crossref", scope: "DOI Registry", needsKey: false },
  { id: "arXiv", label: "arXiv", scope: "Preprints", needsKey: false },
  { id: "Europe PMC", label: "Europe PMC", scope: "Open Access", needsKey: false },
  { id: "OpenAlex", label: "OpenAlex", scope: "Global Index", needsKey: true },
  { id: "Semantic Scholar", label: "Semantic Scholar", scope: "Citation Graph", needsKey: true },
  { id: "IEEE Xplore", label: "IEEE Xplore", scope: "Applied Tech", needsKey: true },
  { id: "CORE", label: "CORE", scope: "Open Repositories", needsKey: true },
] as const;

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  minCitations?: number;
  sort?: "relevance" | "year" | "citations";
}

interface DiscoverViewProps {
  query: string;
  setQuery: (q: string) => void;
  selectedProviders: string[];
  setSelectedProviders: (p: string[]) => void;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  onSearch: (q: string) => void;
  isSearching: boolean;
  results: Paper[];
  diagnostics?: Array<{ source: string; status?: string; error?: string; durationMs: number }>;
  recentSearches: Workspace["searches"];
  savedPaperIds: Set<string>;
  comparedPaperIds: Set<string>;
  onToggleSave: (paper: Paper) => void;
  onToggleCompare: (paper: Paper) => void;
  onOpenReader: (paper: Paper) => void;
  onAddToProject?: (paper: Paper) => void;
}

const SUGGESTED_TOPICS = [
  { title: "Temporal Graph Neural Networks", query: "temporal graph neural networks dynamic graph representation learning", tag: "Graph Intelligence" },
  { title: "Retrieval-Augmented Generation", query: "retrieval augmented generation hallucination mitigation factuality", tag: "Language Models" },
  { title: "Diffusion Models for Structural Biology", query: "diffusion models protein structure prediction conformation dynamics", tag: "Biomedical AI" },
  { title: "Quantum Error Correction", query: "quantum error correction surface codes fault tolerant threshold", tag: "Quantum Computing" },
];

/** Shuffling paper-stack loading state */
function StackLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="relative h-16 w-14">
        <span className="stack-sheet" />
        <span className="stack-sheet" />
        <span className="stack-sheet" />
      </div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)] caret">
        {label}
      </p>
    </div>
  );
}

export function DiscoverView({
  query,
  setQuery,
  selectedProviders,
  setSelectedProviders,
  filters,
  setFilters,
  onSearch,
  isSearching,
  results,
  diagnostics,
  recentSearches,
  savedPaperIds,
  comparedPaperIds,
  onToggleSave,
  onToggleCompare,
  onOpenReader,
  onAddToProject,
}: DiscoverViewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere (outside a field) to jump into the search bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const toggleProvider = (id: string, disabled: boolean) => {
    if (disabled) return;
    if (selectedProviders.includes(id)) {
      if (selectedProviders.length > 1) {
        setSelectedProviders(selectedProviders.filter((p) => p !== id));
      }
    } else {
      setSelectedProviders([...selectedProviders, id]);
    }
  };

  const hasResults = results.length > 0;
  const hasSearched = isSearching || hasResults || (diagnostics && diagnostics.length > 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
      {/* ============ LEFT RAIL (widescreen) ============ */}
      <aside className="hidden xl:block xl:col-span-3 space-y-6 sticky top-8">
        {/* Providers */}
        <section className="bench-card p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="stamp-label">
              <Database className="w-3.5 h-3.5 text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <span className="stamp-underline">Repositories</span>
            </h3>
          </div>
          <div className="space-y-1.5">
            {AVAILABLE_PROVIDERS.map((p) => {
              const active = selectedProviders.includes(p.id);
              const disabled = p.needsKey;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProvider(p.id, disabled)}
                  disabled={disabled}
                  className={`w-full flex items-center justify-between border-2 rounded-[var(--radius-cut)] px-2.5 py-2 text-left transition-all ${
                    disabled
                      ? "border-[var(--border-soft)] hatch-row cursor-not-allowed"
                      : active
                        ? "border-[var(--ink-heading)] bg-[var(--cyan-wash)] shadow-[2px_2px_0_rgba(101,123,131,0.2)]"
                        : "border-transparent hover:border-[var(--border-soft)] hover:bg-[var(--bg-paper-dim)]"
                  }`}
                  aria-pressed={active}
                  title={disabled ? "Key-gated — configure the server credential to enable" : undefined}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`h-3 w-3 border-2 rounded-[1px] flex items-center justify-center shrink-0 ${
                        active ? "border-[var(--ink-heading)] bg-[var(--cyan)]" : "border-[var(--border-ink)]"
                      }`}
                    >
                      {active && <CheckCircle2 className="h-2.5 w-2.5 text-[var(--on-cyan)]" strokeWidth={3.5} />}
                    </span>
                    <div className="min-w-0">
                      <div className={`text-[13px] font-bold leading-tight truncate ${disabled ? "text-[var(--ink-body)]" : ""}`}>{p.label}</div>
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)]">{p.scope}</div>
                    </div>
                  </div>
                  {disabled && <KeyRound className="w-3.5 h-3.5 text-[var(--yellow-ink)] shrink-0" strokeWidth={2.2} />}
                </button>
              );
            })}
          </div>
          <p className="font-mono text-[9.5px] leading-relaxed text-[var(--ink-muted)] uppercase tracking-wider border-t-2 border-dotted border-[var(--border-soft)] pt-2.5">
            Three repositories run key-free. Key-gated sources stay locked in local mode.
          </p>
        </section>

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <section className="bench-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="stamp-label">
                <History className="w-3.5 h-3.5 text-[var(--cyan-ink)]" strokeWidth={2.2} />
                <span className="stamp-underline">Recent</span>
              </h3>
            </div>
            <div className="bench-scroll space-y-1 max-h-72 overflow-y-auto pr-1">
              {recentSearches.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setQuery(s.query);
                    onSearch(s.query);
                  }}
                  className="w-full text-left border-2 border-transparent rounded-[var(--radius-cut)] px-2.5 py-2 hover:border-[var(--border-soft)] hover:bg-[var(--bg-paper-dim)] transition-colors"
                >
                  <div className="text-[12.5px] leading-snug line-clamp-2">{s.query}</div>
                  <div className="font-mono text-[9.5px] text-[var(--ink-muted)] mt-1 flex items-center gap-2 uppercase tracking-wider">
                    <span>{(s.papers || []).length} records</span>
                    <span>·</span>
                    <span>{new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      {/* ============ MAIN COLUMN ============ */}
      <div className="xl:col-span-9 space-y-7">
        {/* ================= HERO ================= */}
        {!hasSearched ? (
          <section className="space-y-5 animate-rise">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cyan-ink)] flex items-center gap-2.5">
              <span className="live-dot" aria-hidden="true" />
              Crossref · arXiv · Europe PMC — live, key-free
            </p>
            <h1 className="font-display font-extrabold text-[2.6rem] sm:text-6xl leading-[0.98] max-w-3xl">
              The research desk that keeps its <span className="marker">receipts.</span>
            </h1>
            <p className="text-base sm:text-lg text-[var(--ink-body)] max-w-2xl leading-relaxed">
              Search real scholarly records, keep every passage verbatim, screen papers
              against your protocol, and walk into your review with an evidence matrix
              that holds up. No black boxes — every claim traces to a line you can point at.
            </p>
          </section>
        ) : (
          /* Compact header once searching */
          <div className="space-y-3 animate-rise">
            <div className="flex items-center gap-3">
              <span className="stamp-label">
                <span className="stamp-num">01</span> / Discover
              </span>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
              <span className="ticket ticket-cyan">
                <span>{selectedProviders.length} repositories</span>
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold font-display">
              Find the literature that matters.
            </h1>
          </div>
        )}

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="search-bar p-2 sm:p-2.5 flex items-center gap-2 animate-rise">
          <div className="pl-3 text-[var(--cyan-ink)]">
            <Search className="w-5 h-5" strokeWidth={2.4} />
          </div>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a topic, phrase, DOI, or arXiv ID… (press / to focus)"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none placeholder:text-[var(--ink-faint)] text-base sm:text-lg py-2.5"
            aria-label="Search query"
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`btn btn-chip font-mono text-[11px] uppercase tracking-wider ${showFilters ? "btn-ink" : "btn-ghost"}`}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </button>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="btn btn-primary h-11 px-5 sm:px-7 text-sm font-mono uppercase tracking-wider"
          >
            {isSearching ? "Searching" : "Search"}
            {!isSearching && <ArrowRight className="w-4 h-4" strokeWidth={2.6} />}
          </button>
        </form>

        {/* Mobile provider chips */}
        <div className="xl:hidden flex flex-wrap gap-1.5">
          {AVAILABLE_PROVIDERS.map((p) => {
            const active = selectedProviders.includes(p.id);
            const disabled = p.needsKey;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProvider(p.id, disabled)}
                disabled={disabled}
                className={`tab-pill ${active ? "!bg-[var(--cyan)] !border-[var(--ink-heading)] !text-[var(--on-cyan)]" : ""} ${disabled ? "hatch-row !border-[var(--border-soft)] !text-[var(--ink-muted)] cursor-not-allowed" : ""}`}
                aria-pressed={active}
                title={disabled ? "Key-gated — configure the server credential to enable" : undefined}
              >
                {p.label}
                {disabled && <KeyRound className="w-3 h-3 text-[var(--yellow-ink)]" strokeWidth={2.2} />}
              </button>
            );
          })}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <section className="bench-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 animate-rise">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Year from</span>
              <input
                type="number"
                value={filters.yearFrom ?? ""}
                onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="1990"
                className="field-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Year to</span>
              <input
                type="number"
                value={filters.yearTo ?? ""}
                onChange={(e) => setFilters({ ...filters, yearTo: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="2025"
                className="field-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Min citations</span>
              <input
                type="number"
                value={filters.minCitations ?? ""}
                onChange={(e) => setFilters({ ...filters, minCitations: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0"
                className="field-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Sort by</span>
              <select
                value={filters.sort ?? "relevance"}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as SearchFilters["sort"] })}
                className="field-input"
              >
                <option value="relevance">Relevance</option>
                <option value="year">Newest first</option>
                <option value="citations">Most cited</option>
              </select>
            </label>
            <label className="flex items-center gap-2.5 col-span-2 sm:col-span-4 cursor-pointer border-t-2 border-dotted border-[var(--border-soft)] pt-3.5">
              <input
                type="checkbox"
                checked={filters.openAccess ?? false}
                onChange={(e) => setFilters({ ...filters, openAccess: e.target.checked })}
                className="h-4 w-4 accent-[var(--cyan)]"
              />
              <span className="text-sm font-bold">Open access only</span>
            </label>
          </section>
        )}

        {/* Suggested topics (when no search yet) */}
        {!hasSearched && (
          <section className="space-y-3 animate-rise">
            <h3 className="stamp-label">
              <Zap className="w-3.5 h-3.5 text-[var(--yellow-ink)]" strokeWidth={2.4} />
              <span className="stamp-underline">Lines of inquiry to try</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SUGGESTED_TOPICS.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  onClick={() => {
                    setQuery(t.query);
                    onSearch(t.query);
                  }}
                  className="bench-card bench-card-lift text-left p-5 group"
                >
                  <div className="ticket ticket-violet mb-3">
                    <span>{t.tag}</span>
                  </div>
                  <div className="text-base font-bold font-display leading-snug group-hover:text-[var(--cyan-ink)] transition-colors">
                    {t.title}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)] group-hover:text-[var(--cyan-ink)] transition-colors">
                    <span>Run search</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Searching state */}
        {isSearching && (
          <div className="bench-card p-8 flex flex-col items-center gap-3">
            <StackLoader label="Querying scholarly repositories" />
            <p className="font-mono text-[10px] text-[var(--ink-muted)] uppercase tracking-[0.18em]">
              Retrieving · Deduplicating · Ranking
            </p>
          </div>
        )}

        {/* Diagnostics */}
        {!isSearching && diagnostics && diagnostics.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <h3 className="stamp-label">
                <span className="stamp-underline">Source telemetry</span>
              </h3>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {diagnostics.map((d) => {
                const ok = d.status === "success" || d.status === "empty";
                const partial = d.status === "partial";
                const unconfigured = d.status === "unconfigured";
                return (
                  <div
                    key={d.source}
                    className={`bench-card !shadow-none p-3 flex items-start gap-2.5 ${
                      ok ? "!border-[var(--green)]" : unconfigured ? "opacity-60" : "!border-[var(--red)]"
                    }`}
                  >
                    {ok ? <CheckCircle2 className="w-4 h-4 text-[var(--green-ink)] mt-0.5 shrink-0" strokeWidth={2.4} />
                      : unconfigured ? <KeyRound className="w-4 h-4 text-[var(--ink-faint)] mt-0.5 shrink-0" />
                      : partial ? <AlertTriangle className="w-4 h-4 text-[var(--orange-ink)] mt-0.5 shrink-0" strokeWidth={2.4} />
                        : <XCircle className="w-4 h-4 text-[var(--red-ink)] mt-0.5 shrink-0" strokeWidth={2.4} />}
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold">{d.source}</span>
                        <span className="font-mono text-[10px] text-[var(--ink-muted)]">{d.durationMs}ms</span>
                      </div>
                      <div className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5">
                        {d.status ?? "—"}
                      </div>
                      {d.error && <div className="text-[11px] text-[var(--ink-muted)] mt-1 line-clamp-2">{d.error}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Results summary strip */}
        {!isSearching && hasResults && diagnostics && diagnostics.length > 0 && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-cell">
              <span className="stat-label">Records</span>
              <span className="stat-value">{results.length}</span>
              <span className="stat-sub">in this snapshot</span>
            </div>
            <div className="stat-cell tone-green">
              <span className="stat-label">Sources live</span>
              <span className="stat-value text-[var(--green-ink)]">
                {diagnostics?.filter((d) => d.status === "success").length ?? 0}
                <span className="text-base font-bold text-[var(--ink-faint)]">/{diagnostics?.length ?? 0}</span>
              </span>
              <span className="stat-sub">responded successfully</span>
            </div>
            <div className="stat-cell tone-yellow">
              <span className="stat-label">Open access</span>
              <span className="stat-value">{results.filter((r) => r.openAccess).length}</span>
              <span className="stat-sub">immediately reachable</span>
            </div>
            <div className="stat-cell tone-violet">
              <span className="stat-label">With PDF</span>
              <span className="stat-value">{results.filter((r) => r.pdfLink || r.identifiers?.arxiv).length}</span>
              <span className="stat-sub">direct full-text</span>
            </div>
          </section>
        )}

        {/* Results list */}
        {!isSearching && hasResults && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="stamp-label">
                <BookOpen className="w-3.5 h-3.5 text-[var(--cyan-ink)]" strokeWidth={2.2} />
                <span className="stamp-underline">Results</span>
              </h3>
              <span className="font-mono text-[10.5px] font-bold tracking-wider text-[var(--ink-muted)] uppercase">
                Showing {results.length} {results.length === 1 ? "record" : "records"}
              </span>
            </div>
            <div className="space-y-4">
              {results.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  isSaved={savedPaperIds.has(paper.id)}
                  isCompared={comparedPaperIds.has(paper.id)}
                  onToggleSave={onToggleSave}
                  onToggleCompare={onToggleCompare}
                  onOpenReader={onOpenReader}
                  onAddToProject={onAddToProject}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty after search */}
        {!isSearching && hasSearched && !hasResults && (
          <div className="bench-card p-12 text-center space-y-4 max-w-xl mx-auto">
            <div className="mx-auto flex h-14 w-14 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--cyan-wash)] text-[var(--cyan-ink)] hatch">
              <Compass className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-extrabold font-display">No records returned</h3>
              <p className="text-sm text-[var(--ink-body)] leading-relaxed">
                Every selected source returned an empty or failed snapshot. Try a broader
                phrase, different repositories, or relax the filters.
              </p>
            </div>
          </div>
        )}

        {/* Provenance footer note */}
        {!isSearching && hasResults && (
          <p className="flex items-start gap-2 font-mono text-[10px] text-[var(--ink-muted)] leading-relaxed max-w-3xl uppercase tracking-wider border-t-2 border-dotted border-[var(--border-soft)] pt-3">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--green-ink)] shrink-0 mt-0.5" strokeWidth={2.2} />
            Bounded snapshot of up to 50 relevance-ordered records per source, deduplicated
            and filtered locally. Counts are not global literature totals. Missing metadata
            cannot satisfy a hard filter.
          </p>
        )}
      </div>
    </div>
  );
}
