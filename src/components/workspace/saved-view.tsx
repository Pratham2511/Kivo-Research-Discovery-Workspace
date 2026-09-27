"use client";

import { useState } from "react";
import {
  Bookmark,
  Search,
  FileCode,
  FileSpreadsheet,
  FileJson,
  Compass,
  ArrowRight,
  Upload,
} from "lucide-react";
import { PaperCard, type Paper } from "./paper-card";
import { bibliography, csv } from "@/lib/workspace/exports";
import { ImportDialog } from "./import-dialog";
import type { Repro } from "@/lib/workspace/schema";

interface SavedViewProps {
  papers: Paper[];
  comparedPaperIds: Set<string>;
  onToggleSave: (paper: Paper) => void;
  onToggleCompare: (paper: Paper) => void;
  onOpenReader: (paper: Paper) => void;
  onNavigateToDiscover: () => void;
  onAddToProject?: (paper: Paper) => void;
  onImportPapers: (papers: Paper[]) => void;
  reproByPaperId?: Record<string, Repro | undefined>;
}

export function SavedView({
  papers,
  comparedPaperIds,
  onToggleSave,
  onToggleCompare,
  onOpenReader,
  onNavigateToDiscover,
  onAddToProject,
  onImportPapers,
  reproByPaperId,
}: SavedViewProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "year" | "citations" | "title">("recent");
  const [showImport, setShowImport] = useState(false);

  const existingPaperIds = new Set(papers.map((p) => p.id));
  const existingDois = new Set(
    papers.map((p) => p.doi?.toLowerCase()).filter(Boolean) as string[]
  );

  const filteredPapers = papers
    .filter((p) => {
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)) ||
        p.abstract.toLowerCase().includes(q) ||
        (p.venue && p.venue.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === "year") return (b.year || 0) - (a.year || 0);
      if (sortBy === "citations") return (b.citationCount || 0) - (a.citationCount || 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0;
    });

  const totalCitations = papers.reduce((sum, p) => sum + (p.citationCount || 0), 0);
  const openAccessCount = papers.filter((p) => p.openAccess).length;
  const distinctVenues = new Set(
    papers.map((p) => (p.venue || "").trim().toLowerCase()).filter(Boolean),
  ).size;

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBibtex = () => {
    const bib = bibliography(papers as unknown as Parameters<typeof bibliography>[0], "bib");
    downloadFile(bib, "kivo-library.bib", "text/plain");
  };

  const handleExportCsv = () => {
    const rows = [
      ["Title", "Authors", "Year", "Venue", "DOI", "Citations", "Abstract"],
      ...papers.map((p) => [
        p.title,
        p.authors.join("; "),
        p.year ?? "",
        p.venue ?? "",
        p.doi ?? "",
        p.citationCount ?? "",
        p.abstract,
      ]),
    ];
    downloadFile(csv(rows), "kivo-library.csv", "text/csv");
  };

  const handleExportJson = () => {
    const json = JSON.stringify(papers, null, 2);
    downloadFile(json, "kivo-library.json", "application/json");
  };

  const hasPapers = papers.length > 0;
  const hasMatches = filteredPapers.length > 0;

  return (
    <div className="space-y-7">
      {/* ===== Section masthead ===== */}
      <div className="space-y-3 animate-rise">
        <div className="flex items-center gap-3">
          <span className="stamp-label">
            <span className="stamp-num">03</span> / Library
          </span>
          <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
          <span className="ticket ticket-yellow">
            <span>{papers.length} {papers.length === 1 ? "record" : "records"}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold font-display leading-[1.05]">
            Your saved <span className="text-[var(--yellow-ink)]">records.</span>
          </h1>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="btn btn-accent-cyan btn-chip text-[11px] font-mono uppercase tracking-wider"
            title="Import references from BibTeX or RIS (Zotero, Mendeley, JabRef)"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={2.4} />
            <span>Import BibTeX / RIS</span>
          </button>
        </div>
        <p className="text-[var(--ink-body)] text-base max-w-2xl leading-relaxed">
          A personal shelf of papers you have bookmarked from discovery — or
          imported from your existing reference manager. Filter, sort, and export
          to BibTeX, CSV, or JSON; your library is persisted locally and travels
          with the workspace.
        </p>
      </div>

      {/* ===== Import dialog ===== */}
      <ImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        existingPaperIds={existingPaperIds}
        existingDois={existingDois}
        onImport={onImportPapers}
      />

      {/* ===== Empty state ===== */}
      {!hasPapers ? (
        <div className="bench-card p-12 sm:p-16 text-center space-y-5 max-w-xl mx-auto animate-rise">
          <div className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--yellow-wash)] text-[var(--yellow-ink)] hatch">
            <Bookmark className="h-8 w-8" strokeWidth={2} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl sm:text-2xl font-extrabold font-display">
              Your library is empty
            </h3>
            <p className="text-sm sm:text-base text-[var(--ink-body)] leading-relaxed max-w-md mx-auto">
              Bookmark papers from discovery, or bring your existing collection
              straight from Zotero via BibTeX / RIS import. Saved records become
              searchable, exportable, and ready to feed screening projects.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="btn btn-accent-cyan h-11 w-full sm:w-auto px-5 text-xs font-mono uppercase tracking-wider"
            >
              <Upload className="w-4 h-4" strokeWidth={2.4} />
              <span>Import from Zotero</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToDiscover}
              className="btn btn-primary h-11 w-full sm:w-auto px-6 text-xs font-mono uppercase tracking-wider"
            >
              <Compass className="w-4 h-4" strokeWidth={2.4} />
              <span>Discover literature</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ===== KPI row ===== */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-rise">
            <div className="stat-cell">
              <span className="stat-label">Records</span>
              <span className="stat-value">{papers.length}</span>
              <span className="stat-sub">saved in your library</span>
            </div>
            <div className="stat-cell tone-violet">
              <span className="stat-label">Citations</span>
              <span className="stat-value">{totalCitations.toLocaleString()}</span>
              <span className="stat-sub">cumulative across records</span>
            </div>
            <div className="stat-cell tone-green">
              <span className="stat-label">Open access</span>
              <span className="stat-value">{openAccessCount}</span>
              <span className="stat-sub">immediately reachable</span>
            </div>
            <div className="stat-cell tone-yellow">
              <span className="stat-label">Venues</span>
              <span className="stat-value">{distinctVenues}</span>
              <span className="stat-sub">distinct sources</span>
            </div>
          </section>

          {/* ===== Toolbar (filter + sort + export) ===== */}
          <section className="space-y-3 animate-rise">
            <div className="flex items-center gap-2.5">
              <h3 className="stamp-label">
                <span className="stamp-underline">Filter &amp; export</span>
              </h3>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
              <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                {filteredPapers.length} shown
              </span>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              {/* Search / filter input */}
              <div className="search-bar flex items-center gap-2 px-3 py-2 flex-1 min-w-0 !shadow-none">
                <Search className="w-4 h-4 text-[var(--cyan-ink)] shrink-0" strokeWidth={2.4} />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Search by title, author, abstract, or venue…"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none placeholder:text-[var(--ink-faint)] text-sm py-1.5"
                  aria-label="Filter library"
                />
                {filterQuery && (
                  <button
                    type="button"
                    onClick={() => setFilterQuery("")}
                    className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] hover:text-[var(--cyan-ink)] px-1.5"
                    aria-label="Clear filter"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Sort dropdown */}
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] hidden sm:inline">
                  Sort
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="field-input !w-auto h-11 cursor-pointer"
                  aria-label="Sort records"
                >
                  <option value="recent">Recently Added</option>
                  <option value="year">Publication Year</option>
                  <option value="citations">Citation Count</option>
                  <option value="title">Title (A → Z)</option>
                </select>
              </div>

              {/* Export buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className="btn btn-accent-cyan btn-chip h-11 text-[11px] font-mono uppercase tracking-wider"
                  title="Import BibTeX / RIS"
                >
                  <Upload className="w-4 h-4" strokeWidth={2.2} />
                  <span className="hidden sm:inline">Import</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportBibtex}
                  className="btn btn-ghost btn-chip h-11 text-[11px] font-mono uppercase tracking-wider"
                  title="Export as BibTeX"
                >
                  <FileCode className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
                  <span className="hidden sm:inline">BibTeX</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="btn btn-accent-green btn-chip h-11 text-[11px] font-mono uppercase tracking-wider"
                  title="Export as CSV"
                >
                  <FileSpreadsheet className="w-4 h-4" strokeWidth={2.2} />
                  <span className="hidden sm:inline">CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="btn btn-ghost btn-chip h-11 text-[11px] font-mono uppercase tracking-wider"
                  title="Export as JSON"
                >
                  <FileJson className="w-4 h-4 text-[var(--violet-ink)]" strokeWidth={2.2} />
                  <span className="hidden sm:inline">JSON</span>
                </button>
              </div>
            </div>
          </section>

          {/* ===== Results ===== */}
          {hasMatches ? (
            <section className="space-y-4 animate-rise">
              <div className="flex items-center gap-2.5">
                <h3 className="stamp-label">
                  <span className="stamp-underline">Records</span>
                </h3>
                <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
                <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                  {filteredPapers.length} shown
                </span>
              </div>
              <div className="space-y-4">
                {filteredPapers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    isSaved={true}
                    isCompared={comparedPaperIds.has(paper.id)}
                    onToggleSave={onToggleSave}
                    onToggleCompare={onToggleCompare}
                    onOpenReader={onOpenReader}
                    onAddToProject={onAddToProject}
                    repro={reproByPaperId?.[paper.id]}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="bench-card p-10 text-center max-w-xl mx-auto space-y-3 animate-rise">
              <div className="mx-auto flex h-12 w-12 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper-dim)] text-[var(--ink-muted)] hatch">
                <Search className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <h3 className="text-lg font-extrabold font-display">
                No records match &ldquo;{filterQuery}&rdquo;
              </h3>
              <p className="text-sm text-[var(--ink-body)] leading-relaxed">
                Try a different search term, or clear the filter to see your full library.
              </p>
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* ===== Provenance footer ===== */}
          {hasMatches && (
            <p className="flex items-start gap-2 font-mono text-[10px] text-[var(--ink-muted)] leading-relaxed max-w-3xl uppercase tracking-wider border-t-2 border-dotted border-[var(--border-soft)] pt-3">
              <Bookmark className="w-3.5 h-3.5 text-[var(--yellow-ink)] shrink-0 mt-0.5" strokeWidth={2.2} />
              Your library is stored locally in this browser. Exports include only records
              listed above; full-text PDFs are not bundled. Remove a record via the bookmark
              toggle on any card.
            </p>
          )}
        </>
      )}
    </div>
  );
}
