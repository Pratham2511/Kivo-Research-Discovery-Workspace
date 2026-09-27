"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import {
  Network,
  Loader2,
  AlertTriangle,
  BookOpen,
  Bookmark,
  Crosshair,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import type { Paper } from "./paper-card";
import type { CitationNeighbor } from "@/lib/academic/types";
import { toS2IdCandidates } from "@/lib/academic/ids";

interface GraphViewProps {
  papers: Paper[];
  initialPaperId?: string | null;
  onOpenReader: (paper: Paper) => void;
  onToggleSave: (paper: Paper) => void;
  savedPaperIds: Set<string>;
}

function neighborToPaper(n: CitationNeighbor): Paper {
  const doi = n.doi?.toLowerCase() ?? null;
  return {
    id: doi ? `doi:${doi}` : n.paperId ? `ss--${n.paperId}` : `graph:${n.title}`,
    title: n.title,
    authors: n.authors,
    abstract: n.abstract || "No abstract available.",
    year: n.year,
    doi,
    pdfLink: n.openAccessPdf,
    citationCount: n.citationCount,
    publisher: null,
    sources: ["Semantic Scholar"],
    sourceUrls: n.paperId
      ? [{ source: "Semantic Scholar", url: `https://www.semanticscholar.org/paper/${n.paperId}` }]
      : [],
    keywords: [],
    openAccess: n.openAccessPdf ? true : null,
    paperType: null,
    venue: n.venue,
    retrievedAt: new Date().toISOString(),
  };
}

interface GraphNode {
  id: string;
  label: string;
  neighbor: CitationNeighbor | null; // null = the center workspace paper
  side: "center" | "refs" | "cites";
  citationCount: number;
  year: number | null;
  openAccess: boolean;
  x: number;
  y: number;
  r: number;
}

interface GraphLink {
  source: string;
  target: string;
  side: "refs" | "cites";
}

const W = 820;
const H = 560;

export function GraphView({
  papers,
  initialPaperId,
  onOpenReader,
  onToggleSave,
  savedPaperIds,
}: GraphViewProps) {
  const [centerPaperId, setCenterPaperId] = useState<string | null>(
    initialPaperId ?? null,
  );
  const centerPaper = useMemo(
    () => papers.find((p) => p.id === centerPaperId) ?? null,
    [papers, centerPaperId],
  );

  const [refs, setRefs] = useState<CitationNeighbor[]>([]);
  const [cites, setCites] = useState<CitationNeighbor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /* ------------------------------------------------------------- fetch */
  const fetchGraph = useCallback(async (paper: Paper) => {
    setSelectedId(null);
    const candidates = toS2IdCandidates(paper);
    let lastApiError: string | null = null;

    /** Fetch one side for one candidate id. Returns null on failure. */
    const fetchSide = async (
      id: string,
      type: "refs" | "cites",
    ): Promise<CitationNeighbor[] | null> => {
      try {
        const res = await fetch(
          `/api/citations?paperId=${encodeURIComponent(id)}&type=${type}`,
        );
        if (!res.ok) {
          try {
            const body = await res.json();
            if (typeof body?.error === "string") lastApiError = body.error;
          } catch {
            /* ignore body parse issues */
          }
          return null;
        }
        const data = await res.json();
        return Array.isArray(data.neighbors) ? data.neighbors : null;
      } catch {
        return null;
      }
    };

    setLoading(true);
    setError(null);

    try {
      // Probe each identifier candidate with the refs side (a 404 fails
      // fast); the first that resolves wins and fetches both sides.
      let winner: string | null = null;
      let refNeighbors: CitationNeighbor[] = [];
      for (const candidate of candidates) {
        const probe = await fetchSide(candidate, "refs");
        if (probe !== null) {
          winner = candidate;
          refNeighbors = probe;
          break;
        }
      }

      // Last resort: best-match title search (placeholder DOIs, etc.).
      let resolvedByTitle = false;
      if (!winner && paper.title) {
        try {
          const res = await fetch(
            `/api/citations?paperId=SEARCH&title=${encodeURIComponent(paper.title.slice(0, 200))}&type=refs`,
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.neighbors)) {
              winner = "SEARCH";
              resolvedByTitle = true;
              refNeighbors = data.neighbors;
            }
          } else {
            try {
              const body = await res.json();
              if (typeof body?.error === "string") lastApiError = body.error;
            } catch {
              /* ignore body parse issues */
            }
          }
        } catch {
          /* ignore — handled by the error path below */
        }
      }

      if (!winner) {
        if (candidates.length === 0) {
          setError(
            "This paper carries no stable Semantic Scholar identifier (DOI, arXiv, PubMed, or S2 id) — the graph cannot be mapped honestly.",
          );
        } else if (lastApiError && !/HTTP 40[04]/.test(lastApiError)) {
          // A provider-level failure (rate limit, outage) — say so honestly.
          setError(lastApiError);
        } else {
          setError(
            "None of this paper's identifiers resolved in the Semantic Scholar index, and no title match was found.",
          );
        }
        setRefs([]);
        setCites([]);
        return;
      }

      // Fetch the citing side with the winning identifier.
      let citeNeighbors: CitationNeighbor[] = [];
      if (winner === "SEARCH") {
        try {
          const res = await fetch(
            `/api/citations?paperId=SEARCH&title=${encodeURIComponent(paper.title.slice(0, 200))}&type=cites`,
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.neighbors)) citeNeighbors = data.neighbors;
          }
        } catch {
          /* keep refs only */
        }
      } else if (winner) {
        citeNeighbors = (await fetchSide(winner, "cites")) ?? [];
      }

      setRefs(refNeighbors);
      setCites(citeNeighbors);

      if (resolvedByTitle) {
        toast.info("Matched by title", {
          description:
            "This record's identifiers were not indexed by Semantic Scholar — the map uses a best title match instead.",
        });
      }
      if (refNeighbors.length === 0 && citeNeighbors.length === 0) {
        setError(
          "The citation provider returned no neighbours for this record — it may be too new or too niche for the Semantic Scholar index.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch whenever the center paper changes (and exists).
  useEffect(() => {
    if (centerPaper) void fetchGraph(centerPaper);
  }, [centerPaper, fetchGraph]);

  // Default to the first saved paper on mount when nothing is centered.
  useEffect(() => {
    if (!centerPaperId && papers.length > 0) setCenterPaperId(papers[0].id);
  }, [centerPaperId, papers]);

  // Restore the last explored center (component-local convenience only).
  useEffect(() => {
    if (initialPaperId) return;
    const stored = localStorage.getItem("kivo_graph_center");
    if (stored && papers.some((p) => p.id === stored)) setCenterPaperId(stored);
  }, [initialPaperId, papers]);

  useEffect(() => {
    if (centerPaperId) localStorage.setItem("kivo_graph_center", centerPaperId);
  }, [centerPaperId]);

  /* ------------------------------------------------------------- layout */
  const { nodes, links } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    if (centerPaper) {
      nodes.push({
        id: `center:${centerPaper.id}`,
        label: centerPaper.title,
        neighbor: null,
        side: "center",
        citationCount: centerPaper.citationCount ?? 0,
        year: centerPaper.year,
        openAccess: !!centerPaper.pdfLink,
        x: 0,
        y: 0,
        r: 16,
      });
    }

    const pushSide = (side: "refs" | "cites", neighbors: CitationNeighbor[]) => {
      for (const n of neighbors) {
        const id = `n:${n.paperId || n.doi || n.title}`;
        if (nodes.some((x) => x.id === id)) continue;
        nodes.push({
          id,
          label: n.title,
          neighbor: n,
          side,
          citationCount: n.citationCount ?? 0,
          year: n.year,
          openAccess: !!n.openAccessPdf,
          x: 0,
          y: 0,
          r: 5 + Math.min(13, Math.log10(1 + (n.citationCount ?? 0)) * 4.2),
        });
        links.push({
          source: side === "refs" ? id : `center:${centerPaper?.id ?? ""}`,
          target: side === "refs" ? `center:${centerPaper?.id ?? ""}` : id,
          side,
        });
      }
    };
    pushSide("refs", refs);
    pushSide("cites", cites);

    if (nodes.length > 1) {
      const sim: Simulation<GraphNode, GraphLink> = forceSimulation(nodes)
        .force("charge", forceManyBody().strength(-190))
        .force(
          "link",
          forceLink<GraphNode, GraphLink>(links)
            .id((d) => d.id)
            .distance((l) => (l.side === "refs" ? 120 : 150))
            .strength(0.45),
        )
        .force("collide", forceCollide<GraphNode>((d) => d.r + 9))
        .force("x", forceX(0).strength(0.05))
        .force("y", forceY(0).strength(0.05))
        .stop();
      // Pre-tick a stable layout — deterministic render, no animation jank.
      for (let i = 0; i < 320; i++) sim.tick();
    }

    // Scale positions into the viewBox with a margin.
    const PAD = 56;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    for (const n of nodes) {
      n.x = PAD + ((n.x - minX) / spanX) * (W - PAD * 2);
      n.y = PAD + ((n.y - minY) / spanY) * (H - PAD * 2);
    }
    return { nodes, links };
  }, [centerPaper, refs, cites]);

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );
  const selectedPaper = useMemo(
    () => (selected?.neighbor ? neighborToPaper(selected.neighbor) : centerPaper),
    [selected, centerPaper],
  );

  /* ------------------------------------------------------------- actions */
  const recentreOnNode = (node: GraphNode) => {
    if (!node.neighbor) {
      setSelectedId(node.id);
      return;
    }
    // Promote the neighbour to a full Paper and center the map on it.
    const paper = neighborToPaper(node.neighbor);
    const known = papers.find(
      (p) => p.id === paper.id || (paper.doi && p.doi?.toLowerCase() === paper.doi),
    );
    setCenterPaperId(known ? known.id : paper.id);
    if (!known) {
      // A graph-only paper isn't in the library yet — seed the picker with it
      // by adding it to the local component context via state lift: simplest
      // honest path is saving it, which the desk handler dedupes.
      onToggleSave(paper);
      toast.info("Paper centered", {
        description: "It was also saved to your library so the desk tracks it.",
      });
    } else {
      toast.info("Re-centered", { description: paper.title.slice(0, 70) });
    }
    setSelectedId(null);
  };

  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `citation-map-${(centerPaper?.title ?? "graph").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Map exported", { description: "Standalone SVG, Solarized ink included." });
  };

  const labelNodes = useMemo(
    () =>
      [...nodes]
        .filter((n) => n.side !== "center")
        .sort((a, b) => b.citationCount - a.citationCount)
        .slice(0, 14),
    [nodes],
  );

  /* ------------------------------------------------------------- render */
  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-2.5">
          <Network className="w-6 h-6 text-[var(--cyan-ink)]" strokeWidth={2.2} />
          <span className="stamp-label">
            <span className="stamp-underline">08 · Citation map</span>
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight leading-[1.05]">
          Every paper sits in a <span className="marker">web of citations</span>.
        </h1>
        <p className="text-sm sm:text-base text-[var(--ink-body)] max-w-2xl leading-relaxed">
          Pick a paper from your library and map its references and citations —
          twenty neighbours each side, straight from the Semantic Scholar graph.
          Click a node to inspect it; double-click to re-center the map there.
        </p>
      </header>

      {/* Paper picker */}
      <section className="bench-card !p-4 space-y-3">
        <label
          htmlFor="graph-center"
          className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)] block"
        >
          Center the map on
        </label>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <select
            id="graph-center"
            value={centerPaperId ?? ""}
            onChange={(e) => setCenterPaperId(e.target.value || null)}
            className="field-input flex-1 !text-sm font-bold"
          >
            {papers.length === 0 && (
              <option value="">No saved papers yet — search and save one first</option>
            )}
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title.slice(0, 84)}
                {p.title.length > 84 ? "…" : ""}
              </option>
            ))}
          </select>
          {centerPaper && (
            <div className="flex items-center gap-2">
              <span className="ticket ticket-cyan whitespace-nowrap">
                {refs.length} refs · {cites.length} cites
              </span>
              <button
                type="button"
                onClick={exportSvg}
                className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                title="Download the map as a standalone SVG"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2.2} />
                <span>Export</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Map */}
      <section className="bench-card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--border-ink)] bg-[var(--bg-paper-dim)] px-4 sm:px-5 py-3">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-[var(--ink-heading)]">
              <span className="inline-block w-3 h-3 border-2 border-[var(--border-ink)] bg-[var(--cyan)]" aria-hidden="true" />
              References
            </span>
            <span className="flex items-center gap-1.5 text-[var(--ink-heading)]">
              <span className="inline-block w-3 h-3 border-2 border-[var(--border-ink)] bg-[var(--orange)]" aria-hidden="true" />
              Cited by
            </span>
            <span className="flex items-center gap-1.5 text-[var(--ink-muted)]">
              <span className="inline-block w-3 h-3 border-2 border-[var(--border-ink)] bg-[var(--bg-inset)]" aria-hidden="true" />
              Size = citations
            </span>
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)]">
            Semantic Scholar graph · 20 neighbours/side
          </span>
        </div>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--bg-paper)]/85">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                Walking the citation graph…
              </span>
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={`Citation map for ${centerPaper?.title ?? "paper"}`}
            className="block bg-[var(--bg-paper)]"
            style={{ background: "var(--bg-paper)" }}
          >
            {/* links — d3 mutates source/target into node refs during layout */}
            {links.map((l, i) => {
              const a = (
                typeof l.source === "string"
                  ? nodes.find((n) => n.id === l.source)
                  : (l.source as GraphNode)
              ) as GraphNode | undefined;
              const b = (
                typeof l.target === "string"
                  ? nodes.find((n) => n.id === l.target)
                  : (l.target as GraphNode)
              ) as GraphNode | undefined;
              if (!a || !b) return null;
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={l.side === "refs" ? "var(--cyan)" : "var(--orange)"}
                  strokeWidth={1.4}
                  strokeOpacity={0.55}
                />
              );
            })}
            {/* nodes */}
            {nodes.map((n) => {
              const isSel = n.id === selectedId;
              const fill =
                n.side === "center"
                  ? "var(--ink-heading)"
                  : n.side === "refs"
                    ? "var(--cyan)"
                    : "var(--orange)";
              return (
                <g
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  onDoubleClick={() => recentreOnNode(n)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label={`${n.label}${n.year ? ` (${n.year})` : ""}, ${n.citationCount} citations`}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={fill}
                    stroke={isSel ? "var(--yellow)" : "var(--border-ink)" }
                    strokeWidth={isSel ? 4 : 2}
                  />
                  {n.openAccess && (
                    <circle
                      cx={n.x + n.r * 0.75}
                      cy={n.y - n.r * 0.75}
                      r={2.6}
                      fill="var(--green)"
                      stroke="var(--bg-paper)"
                      strokeWidth={1}
                    />
                  )}
                  {n.side === "center" && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r + 5}
                      fill="none"
                      stroke="var(--ink-heading)"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                    />
                  )}
                </g>
              );
            })}
            {/* labels for the most-cited nodes */}
            {labelNodes.map((n) => {
              const words = n.label.split(" ");
              const line1 = words.slice(0, 4).join(" ");
              const line2 = words.length > 4 ? "…" : "";
              return (
                <text
                  key={`lbl-${n.id}`}
                  x={n.x}
                  y={n.y + n.r + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="IBM Plex Mono, Menlo, monospace"
                  fill="var(--ink-muted)"
                  pointerEvents="none"
                >
                  {`${line1}${line2}`.slice(0, 30) + (n.label.length > 30 ? "…" : "")}
                </text>
              );
            })}
            {/* center label */}
            {centerPaper && (
              <text
                x={W / 2}
                y={H - 12}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fontFamily="IBM Plex Mono, Menlo, monospace"
                fill="var(--ink-heading)"
              >
                {`◆ ${centerPaper.title.slice(0, 64)}${centerPaper.title.length > 64 ? "…" : ""}`}
              </text>
            )}
          </svg>
        </div>

        {/* Error strip */}
        {error && !loading && (
          <div className="flex items-start gap-2 border-t-2 border-[var(--yellow)] bg-[var(--yellow-wash)] text-[var(--yellow-ink)] px-4 py-2.5 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2.4} />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Selected node details */}
      {selected && selectedPaper && (
        <section className="bench-card p-5 sm:p-6 space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`ticket ${selected.side === "center" ? "ticket-violet" : selected.side === "refs" ? "ticket-cyan" : "ticket-orange"}`}>
              {selected.side === "center"
                ? "Center paper"
                : selected.side === "refs"
                  ? "Reference"
                  : "Citing paper"}
            </span>
            {selected.year && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                {selected.year}
              </span>
            )}
            {selected.citationCount > 0 && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                {selected.citationCount.toLocaleString()} citations
              </span>
            )}
            {selectedPaper.venue && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] truncate max-w-[240px]">
                {selectedPaper.venue}
              </span>
            )}
          </div>

          <h3 className="text-lg sm:text-xl font-extrabold font-display leading-snug">
            {selectedPaper.title}
          </h3>
          <p className="text-[13px] italic text-[var(--ink-body)]">
            {selectedPaper.authors.slice(0, 6).join(", ")}
            {selectedPaper.authors.length > 6 ? " et al." : ""}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onOpenReader(selectedPaper)}
              className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              <BookOpen className="w-3.5 h-3.5" strokeWidth={2.4} />
              <span>Open in Reader</span>
            </button>
            {selected.neighbor && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const known = savedPaperIds.has(selectedPaper.id);
                    onToggleSave(selectedPaper);
                    if (!known)
                      toast.success("Saved to your library", {
                        description: selectedPaper.title.slice(0, 70),
                      });
                  }}
                  className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                    savedPaperIds.has(selectedPaper.id)
                      ? "btn-accent-yellow !shadow-none"
                      : "btn-ghost"
                  }`}
                  aria-pressed={savedPaperIds.has(selectedPaper.id)}
                >
                  <Bookmark className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span>
                    {savedPaperIds.has(selectedPaper.id) ? "Saved" : "Save"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => recentreOnNode(selected)}
                  className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
                  title="Re-center the map on this paper"
                >
                  <Crosshair className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span>Re-center</span>
                </button>
                {selectedPaper.pdfLink && (
                  <a
                    href={selectedPaper.pdfLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                    <span>PDF</span>
                  </a>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Honest methods note */}
      <p className="font-mono text-[9.5px] uppercase tracking-wider leading-relaxed text-[var(--ink-muted)] border-t-2 border-dotted border-[var(--border-soft)] pt-4">
        Maps are fetched live from the Semantic Scholar Graph API and are capped
        at 20 references + 20 citing papers per centre — the same bound the
        original KIVO citation service used. Node positions are computed with a
        force-directed layout (d3-force) and rendered statically.
      </p>
    </div>
  );
}
