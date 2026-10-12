"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { Search, SlidersHorizontal, ArrowRight, ArrowLeft, Check, ChevronDown, History, AlertCircle, ExternalLink } from "lucide-react";
import type { Workspace } from "@/lib/workspace/schema";
import { searchPage, SEARCH_PAGE_SIZE, type SearchFilters } from "@/lib/workspace/search";
import { PaperCard, type Paper } from "./paper-card";
export type { SearchFilters } from "@/lib/workspace/search";

export const AVAILABLE_PROVIDERS = [
  { id: "Crossref", label: "Crossref", needsKey: false },
  { id: "arXiv", label: "arXiv", needsKey: false },
  { id: "Europe PMC", label: "Europe PMC", needsKey: false },
  { id: "OpenAlex", label: "OpenAlex", needsKey: true },
  { id: "Semantic Scholar", label: "Semantic Scholar", needsKey: true },
  { id: "IEEE Xplore", label: "IEEE Xplore", needsKey: true },
  { id: "CORE", label: "CORE", needsKey: true },
] as const;

interface DiscoverViewProps {
  query: string;
  setQuery: (query: string) => void;
  selectedProviders: string[];
  setSelectedProviders: (providers: string[]) => void;
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  onSearch: (query: string) => void;
  isSearching: boolean;
  hasSearched: boolean;
  resultsQuery: string;
  error: string;
  results: Paper[];
  pageIndex: number;
  onPageChange: (index: number) => void;
  configuredProviders: Record<string, boolean>;
  diagnostics?: Array<{ source: string; status?: string; error?: string; durationMs: number }>;
  recentSearches: Workspace["searches"];
  onRestoreSearch: (search: Workspace["searches"][number]) => void;
  savedPaperIds: Set<string>;
  comparedPaperIds: Set<string>;
  onToggleSave: (paper: Paper) => void;
  onToggleCompare: (paper: Paper) => void;
  onOpenReader: (paper: Paper) => void;
  onAddToProject?: (paper: Paper) => void;
}

const TOPICS = [
  { label: "Retrieval-augmented generation", query: "retrieval augmented generation hallucination mitigation factuality", area: "Language models" },
  { label: "Temporal graph neural networks", query: "temporal graph neural networks dynamic graph representation learning", area: "Graph learning" },
  { label: "Protein structure prediction", query: "diffusion models protein structure prediction conformation dynamics", area: "Biology" },
  { label: "Quantum error correction", query: "quantum error correction surface codes fault tolerant threshold", area: "Quantum computing" },
];

export function DiscoverView(props: DiscoverViewProps) {
  const { query, setQuery, filters, setFilters, selectedProviders, setSelectedProviders,
    onSearch, isSearching, hasSearched, resultsQuery, error, results, pageIndex, onPageChange,
    diagnostics = [], recentSearches, onRestoreSearch, configuredProviders } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const pagination = searchPage(results, pageIndex);
  const activeFilters = [filters.yearFrom, filters.yearTo, filters.minCitations, filters.openAccess || undefined].filter(v => v !== undefined).length;
  const responded = diagnostics.filter(s => ["success", "empty", "partial"].includes(s.status ?? "")).length;

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !target?.closest("input, textarea, select, [contenteditable=true]")) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function submit(event: FormEvent) { event.preventDefault(); onSearch(query); }
  function changePage(index: number) {
    onPageChange(index);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function toggleSource(id: string) {
    if (selectedProviders.includes(id)) {
      if (selectedProviders.length > 1) setSelectedProviders(selectedProviders.filter(source => source !== id));
    } else setSelectedProviders([...selectedProviders, id]);
  }

  return (
    <div className="discover-page">
      <header className="discovery-heading">
        <p className="section-kicker">Discover</p>
        <h1>Good research starts<br className="hidden sm:block" /> with a <span>better source.</span></h1>
        <p>Find papers across trusted scholarly sources. Save what matters, then follow the evidence.</p>
      </header>

      <section className="search-workbench" aria-label="Search scholarly papers">
        <form onSubmit={submit} className="discovery-search">
          <Search size={22} aria-hidden="true" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search a topic, title, DOI, or arXiv ID"
            aria-label="Search query" aria-describedby={error ? "search-error" : "search-help"}
            maxLength={1000} />
          <button type="submit" className="btn btn-primary search-submit" disabled={isSearching || !query.trim()}>
            {isSearching ? "Searching…" : "Search papers"} <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        <div className="search-controls">
          <p id="search-help">Search the literature. <kbd>/</kbd> to focus.</p>
          <details className="filter-disclosure">
            <summary><SlidersHorizontal size={15} /> Filters {activeFilters > 0 && <span>{activeFilters}</span>}<ChevronDown size={14} /></summary>
            <div className="search-filter-fields">
              <label>Year from<input type="number" min={1800} max={2100} className="field-input"
                value={filters.yearFrom ?? ""} onChange={e => setFilters({ ...filters, yearFrom: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <label>Year to<input type="number" min={1800} max={2100} className="field-input"
                value={filters.yearTo ?? ""} onChange={e => setFilters({ ...filters, yearTo: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <label>Minimum citations<input type="number" min={0} max={10000000} className="field-input"
                value={filters.minCitations ?? ""} onChange={e => setFilters({ ...filters, minCitations: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <label className="filter-check"><input type="checkbox" checked={filters.openAccess ?? false}
                onChange={e => setFilters({ ...filters, openAccess: e.target.checked })} /> Open access only</label>
              <p>Filters apply when you search. Records missing the required metadata are excluded.</p>
              {activeFilters > 0 && <button type="button" className="text-action" onClick={() => setFilters({ sort: filters.sort })}>Clear filters</button>}
            </div>
          </details>
        </div>
        <div className="search-sources" aria-label="Research sources">
          <span>Search in</span>
          {AVAILABLE_PROVIDERS.filter(provider => configuredProviders[provider.id]).map(provider => (
            <button type="button" key={provider.id} onClick={() => toggleSource(provider.id)}
              className={"source-choice " + (selectedProviders.includes(provider.id) ? "is-selected" : "")}
              aria-pressed={selectedProviders.includes(provider.id)}>
              {selectedProviders.includes(provider.id) && <Check size={13} aria-hidden="true" />} {provider.label}
            </button>
          ))}
          <details className="extra-sources">
            <summary>More sources <ChevronDown size={13} /></summary>
            <div>{AVAILABLE_PROVIDERS.filter(provider => !configuredProviders[provider.id]).map(provider => (
              <span key={provider.id}>{provider.label}<small>Requires server configuration</small></span>
            ))}
            <a href="https://github.com/Pratham2511/Kivo-Research-Discovery-Workspace#configuration" target="_blank" rel="noopener noreferrer">Source setup <ExternalLink size={12} /></a></div>
          </details>
        </div>
        {error && <div id="search-error" role="alert" className="inline-error"><AlertCircle size={18} /><p>{error}</p></div>}
      </section>

      {isSearching && <div className="search-loading" role="status" aria-live="polite">
        <div className="search-loading-lines"><span /><span /><span /></div>
        <div><strong>Searching your sources</strong><p>Retrieving papers, removing duplicates, and checking your filters.</p></div>
      </div>}

      {!hasSearched && !isSearching && (
        <div className="discover-start">
          <section className="topic-section">
            <h2>Start with a line of inquiry</h2>
            <div className="topic-grid">{TOPICS.map(topic => (
              <button type="button" key={topic.query} onClick={() => { setQuery(topic.query); onSearch(topic.query); }}>
                <small>{topic.area}</small><span>{topic.label}</span><ArrowRight size={18} />
              </button>
            ))}</div>
          </section>
          <aside className="workflow-guide">
            <span className="section-kicker">Your next steps</span>
            <ol>
              <li><span>1</span><div><strong>Find a paper</strong><p>Search by topic or paste a DOI.</p></div></li>
              <li><span>2</span><div><strong>Keep the useful ones</strong><p>Save papers to your library.</p></div></li>
              <li><span>3</span><div><strong>Read. Capture. Connect.</strong><p>Keep quotes with their sources, then build your review.</p></div></li>
            </ol>
            <p className="local-note">Your research stays in this browser. Back it up from the sidebar.</p>
          </aside>
        </div>
      )}

      {hasSearched && (
        <section ref={resultsRef} className="search-results" aria-label="Search results" aria-busy={isSearching}>
          <div className="results-heading">
            <div><h2>{results.length === 0 ? "No matching papers" : "Search results"}</h2>
              <p>{results.length.toLocaleString()} {results.length === 1 ? "paper" : "papers"} in this snapshot for <strong>“{resultsQuery}”</strong></p></div>
            <label className="results-sort">Sort by<select className="field-input" aria-label="Sort results" value={filters.sort ?? "relevance"}
              onChange={e => setFilters({ ...filters, sort: e.target.value as SearchFilters["sort"] })}>
              <option value="relevance">Best match</option><option value="year">Newest first</option><option value="citations">Most cited</option>
            </select></label>
          </div>
          {diagnostics.length > 0 && <details className="source-telemetry">
            <summary>{responded} of {diagnostics.length} sources responded <ChevronDown size={14} /></summary>
            <div>{diagnostics.map(source => <p key={source.source}>
              <strong>{source.source}</strong><span>{source.status === "success" ? "Available" : source.status === "empty" ? "No matches" : source.status}</span>
              {source.error && <small>{source.error}</small>}
            </p>)}</div>
          </details>}
          {results.length > 0 ? <>
            <div className="results-pagebar">
              <div className="results-range" aria-live="polite">Showing {pagination.page * SEARCH_PAGE_SIZE + 1}–{Math.min((pagination.page + 1) * SEARCH_PAGE_SIZE, results.length)} of {results.length}</div>
              {pagination.pages > 1 && <nav aria-label="Quick result page navigation">
                <button type="button" className="btn btn-ghost" aria-label="Go to previous results page" disabled={pagination.page === 0} onClick={() => changePage(pagination.page - 1)}><ArrowLeft size={14} /></button>
                <span>{pagination.page + 1} / {pagination.pages}</span>
                <button type="button" className="btn btn-ghost" aria-label="Go to next results page" disabled={pagination.page === pagination.pages - 1} onClick={() => changePage(pagination.page + 1)}><ArrowRight size={14} /></button>
              </nav>}
            </div>
            <div className="paper-list">{pagination.papers.map(paper => <PaperCard key={paper.id} paper={paper}
              isSaved={props.savedPaperIds.has(paper.id)} isCompared={props.comparedPaperIds.has(paper.id)}
              onToggleSave={props.onToggleSave} onToggleCompare={props.onToggleCompare}
              onOpenReader={props.onOpenReader} onAddToProject={props.onAddToProject} />)}</div>
            {pagination.pages > 1 && <nav className="results-pagination" aria-label="Search result pages">
              <button type="button" className="btn btn-ghost" disabled={pagination.page === 0} onClick={() => changePage(pagination.page - 1)}><ArrowLeft size={16} /> Previous</button>
              <span>Page <strong>{pagination.page + 1}</strong> of {pagination.pages}</span>
              <button type="button" className="btn btn-primary" disabled={pagination.page === pagination.pages - 1} onClick={() => changePage(pagination.page + 1)}>Next page <ArrowRight size={16} /></button>
            </nav>}
          </> : <div className="search-empty"><Search size={30} /><p>Try a broader phrase, another source, or fewer filters.</p>
            <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ sort: "relevance" }); inputRef.current?.focus(); }}>Adjust your search</button></div>}
          <p className="snapshot-note">Up to 50 records per source, deduplicated into a bounded snapshot. This is a starting set, not a count of all published literature.</p>
        </section>
      )}

      {recentSearches.length > 0 && <section className="recent-searches" aria-label="Recent searches">
        <h2><History size={17} /> Pick up a recent search</h2>
        <div>{recentSearches.slice(0, 4).map(search => <button key={search.id} type="button" onClick={() => onRestoreSearch(search)}>
          <span>{search.query}</span><small>{search.papers.length} {search.papers.length === 1 ? "paper" : "papers"}</small><ArrowRight size={15} />
        </button>)}</div>
      </section>}
    </div>
  );
}
