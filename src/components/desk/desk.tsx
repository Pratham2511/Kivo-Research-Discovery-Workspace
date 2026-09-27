"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { BookOpen, Compass } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./use-workspace";
import { WorkspaceShell, type ActiveSection } from "../workspace/workspace-shell";
import { DiscoverView, type SearchFilters } from "../workspace/discover-view";
import { ReaderView } from "../workspace/reader-view";
import { SavedView } from "../workspace/saved-view";
import { ProjectsView } from "../workspace/projects-view";
import { CompareView } from "../workspace/compare-view";
import { UpdatesView } from "../workspace/updates-view";
import { ReviewView } from "../workspace/review-view";
import { GraphView } from "../workspace/graph-view";
import { BuilderView } from "../workspace/builder-view";
import type { Paper } from "../workspace/paper-card";
import type { ClaimStance, Evidence, Repro } from "@/lib/workspace/schema";
import {
  blindProjectFromBundle,
  type SeminarBundle,
} from "@/lib/workspace/seminar";
import {
  claimStatus,
} from "@/lib/workspace/argument";
import {
  applyGrade,
  buildFlashcards,
  dueQueue,
  type Grade,
} from "@/lib/workspace/srs";

interface DeskProps {
  section?: "discover" | "reading" | "projects" | "updates";
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Client-side ranking of a result snapshot according to the chosen sort. */
function sortPapers(papers: Paper[], sort: SearchFilters["sort"]): Paper[] {
  if (sort === "year") {
    return [...papers].sort((a, b) => (b.year || 0) - (a.year || 0));
  }
  if (sort === "citations") {
    return [...papers].sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
  }
  return papers; // relevance — keep upstream order
}

export function Desk({ section }: DeskProps) {
  const { state, mutate, storageStatus } = useWorkspace();

  // Active view routing
  const [currentSection, setCurrentSection] = useState<ActiveSection>(() => {
    if (section === "reading") return "reading";
    if (section === "projects") return "projects";
    if (section === "updates") return "updates";
    return "discover";
  });

  // Active paper in reader
  const [activeReaderPaper, setActiveReaderPaper] = useState<Paper | null>(null);

  // Active project
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Graph explorer: which library paper the map should center on
  const [graphCenterId, setGraphCenterId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([
    "Crossref",
    "arXiv",
    "Europe PMC",
  ]);
  const [filters, setFilters] = useState<SearchFilters>({
    sort: "relevance",
  });
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [diagnostics, setDiagnostics] = useState<
    Array<{ source: string; status?: string; error?: string; durationMs: number }>
  >([]);

  // Initialize active project if exists
  useEffect(() => {
    if (state.projects.length > 0 && !activeProjectId) {
      setActiveProjectId(state.projects[0].id);
    }
  }, [state.projects, activeProjectId]);

  // If activeReaderPaper is not set but reader route was requested, default to first saved paper
  useEffect(() => {
    if (currentSection === "reading" && !activeReaderPaper && state.papers.length > 0) {
      setActiveReaderPaper(state.papers[0]);
    }
  }, [currentSection, activeReaderPaper, state.papers]);

  // Derived sets for O(1) membership checks
  const savedPaperIds = useMemo(
    () => new Set(state.papers.map((p) => p.id)),
    [state.papers]
  );

  const comparedPaperIds = useMemo(
    () => new Set(state.compare),
    [state.compare]
  );

  // Search action
  const handleSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setIsSearching(true);
      setDiagnostics([]);

      try {
        // Filters are nested for the API contract; `sort` is applied locally
        // on the returned snapshot so the dropdown actually re-orders results.
        const payload = {
          query: q.trim(),
          filters: {
            yearFrom: filters.yearFrom,
            yearTo: filters.yearTo,
            openAccessOnly: filters.openAccess,
            minCitations: filters.minCitations,
          },
          sources: selectedProviders,
        };

        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && Array.isArray(data.papers)) {
          setSearchResults(sortPapers(data.papers, filters.sort));
          // The API reports per-source telemetry under `sources`; normalise it
          // into the diagnostics shape the views expect.
          const sourceTelemetry: Array<{
            source: string;
            status?: string;
            error?: string;
            durationMs: number;
          }> = (data.sources || []).map(
            (s: { source: string; status?: string; error?: string; durationMs: number }) => ({
              source: s.source,
              status: s.status,
              error: s.error,
              durationMs: s.durationMs,
            })
          );
          setDiagnostics(sourceTelemetry);

          // Record in workspace searches history
          void mutate((draft) => {
            draft.searches.unshift({
              id: uid(),
              query: q.trim(),
              filters: payload as unknown as Record<string, unknown>,
              providers: selectedProviders,
              createdAt: now(),
              papers: data.papers.slice(0, 50),
              diagnostics: sourceTelemetry,
            });
            if (draft.searches.length > 50) {
              draft.searches = draft.searches.slice(0, 50);
            }
          });
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error("Search failed", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [filters, selectedProviders, mutate]
  );

  // Re-apply local sort when the sort control changes with results on screen
  useEffect(() => {
    setSearchResults((prev) => (prev.length > 0 ? sortPapers(prev, filters.sort) : prev));
  }, [filters.sort]);

  // Import papers from BibTeX / RIS into the library
  const handleImportPapers = useCallback(
    (papers: Paper[]) => {
      void mutate((draft) => {
        const known = new Set(
          draft.papers.map((p) => (p.doi ? `doi:${p.doi.toLowerCase()}` : p.id))
        );
        let added = 0;
        for (const paper of papers) {
          const identity = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.id;
          if (known.has(identity)) continue;
          known.add(identity);
          draft.papers.push(paper);
          added++;
        }
        // Surface the true merge count via a tick after the mutation applies.
        if (added > 0) {
          queueMicrotask(() =>
            toast.success(
              `Imported ${added} ${added === 1 ? "record" : "records"}`,
              { description: "Your library is persisted locally in this browser." }
            )
          );
        }
      });
    },
    [mutate]
  );

  // Toggle Save paper in Library
  const handleToggleSave = useCallback(
    (paper: Paper) => {
      const wasSaved = state.papers.some((p) => p.id === paper.id);
      void mutate((draft) => {
        const index = draft.papers.findIndex((p) => p.id === paper.id);
        if (index >= 0) {
          draft.papers.splice(index, 1);
        } else {
          draft.papers.unshift(paper);
        }
      });
      toast.success(
        wasSaved ? "Removed from your library" : "Saved to your library",
        { description: wasSaved ? undefined : paper.title.slice(0, 80) }
      );
    },
    [mutate, state.papers]
  );

  // Toggle Compare paper
  const handleToggleCompare = useCallback(
    (paper: Paper) => {
      const isCompared = state.compare.includes(paper.id);
      void mutate((draft) => {
        const exists = draft.compare.includes(paper.id);
        if (exists) {
          draft.compare = draft.compare.filter((id) => id !== paper.id);
        } else {
          if (draft.compare.length < 8) {
            draft.compare.push(paper.id);
            // Ensure paper is saved so metadata is retained
            if (!draft.papers.some((p) => p.id === paper.id)) {
              draft.papers.push(paper);
            }
          } else {
            queueMicrotask(() =>
              toast.warning("Compare tray is full", {
                description: "Up to 8 records fit side-by-side. Remove one first.",
              })
            );
          }
        }
      });
      if (!isCompared && state.compare.length < 8) {
        toast.success("Added to comparison", {
          description: `${state.compare.length + 1} of 8 columns filled.`,
        });
      } else if (isCompared) {
        toast.info("Removed from comparison");
      }
    },
    [mutate, state.compare]
  );

  // Remove from compare
  const handleRemoveFromCompare = useCallback(
    (paperId: string) => {
      void mutate((draft) => {
        draft.compare = draft.compare.filter((id) => id !== paperId);
      });
    },
    [mutate]
  );

  const handleClearCompare = useCallback(() => {
    void mutate((draft) => {
      draft.compare = [];
    });
  }, [mutate]);

  // Open Paper in Reader View
  const handleOpenReader = useCallback((paper: Paper) => {
    setActiveReaderPaper(paper);
    setCurrentSection("reading");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Add Paper to Current Project
  const handleAddToProject = useCallback(
    (paper: Paper) => {
      if (state.projects.length === 0) {
        // Auto-create a default project if none exists
        const newProjId = uid();
        void mutate((draft) => {
          draft.projects.push({
            id: newProjId,
            name: "Initial Literature Review",
            question: "Synthesizing primary findings across search results",
            criteria: "Empirical papers with peer review or preprint release",
            members: [
              {
                paperId: paper.id,
                status: "unread",
                decision: "unscreened",
                reason: "",
                notes: "",
                tags: "",
              },
            ],
            createdAt: now(),
          });
          if (!draft.papers.some((p) => p.id === paper.id)) {
            draft.papers.push(paper);
          }
        });
        setActiveProjectId(newProjId);
        return;
      }

      const targetProjectId = activeProjectId || state.projects[0].id;
      void mutate((draft) => {
        const proj = draft.projects.find((p) => p.id === targetProjectId);
        if (proj && !proj.members.some((m) => m.paperId === paper.id)) {
          proj.members.push({
            paperId: paper.id,
            status: "unread",
            decision: "unscreened",
            reason: "",
            notes: "",
            tags: "",
          });
        }
        if (!draft.papers.some((p) => p.id === paper.id)) {
          draft.papers.push(paper);
        }
      });
    },
    [state.projects, activeProjectId, mutate]
  );

  // Create Project
  const handleCreateProject = useCallback(
    (name: string, question: string, criteria: string) => {
      const id = uid();
      void mutate((draft) => {
        draft.projects.push({
          id,
          name,
          question,
          criteria,
          members: [],
          createdAt: now(),
        });
      });
      setActiveProjectId(id);
    },
    [mutate]
  );

  // Update Member Decision
  const handleUpdateMemberDecision = useCallback(
    (
      projectId: string,
      paperId: string,
      decision: "include" | "exclude" | "maybe" | "unscreened",
      reason: string
    ) => {
      void mutate((draft) => {
        const proj = draft.projects.find((p) => p.id === projectId);
        if (proj) {
          const member = proj.members.find((m) => m.paperId === paperId);
          if (member) {
            const before = member.decision;
            member.decision = decision;
            member.reason = reason;

            draft.events.push({
              id: uid(),
              projectId,
              paperId,
              before,
              after: decision,
              reason,
              createdAt: now(),
            });
          }
        }
      });
    },
    [mutate]
  );

  // Update the per-paper reproducibility checklist inside a project
  const handleUpdateMemberRepro = useCallback(
    (projectId: string, paperId: string, repro: Repro | undefined) => {
      void mutate((draft) => {
        const proj = draft.projects.find((p) => p.id === projectId);
        const member = proj?.members.find((m) => m.paperId === paperId);
        if (member) {
          if (repro) member.repro = repro;
          else delete member.repro;
        }
      });
    },
    [mutate]
  );

  // ── Seminar mode ────────────────────────────────────────────────────────

  // Download the exporter's bundle as a self-contained JSON file.
  const handleExportSeminarBundle = useCallback((bundle: SeminarBundle) => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seminar-bundle-${bundle.projectName}.kivo.json`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Seminar bundle downloaded", {
      description: `${bundle.papers.length} papers · ${
        Object.keys(bundle.decisions).length
      } decisions — send the file to your peer.`,
    });
  }, []);

  // Build the blind seminar project from a peer's bundle: papers join the
  // workspace (deduped), decisions start unscreened — the peer's own call.
  const handleImportSeminarBundle = useCallback(
    async (bundle: SeminarBundle): Promise<boolean> => {
      const blind = blindProjectFromBundle(bundle);
      const id = uid();
      const ok = await mutate((draft) => {
        const known = new Set(draft.papers.map((p) => p.id));
        for (const bp of blind.papers) {
          if (known.has(bp.paperId)) continue;
          known.add(bp.paperId);
          draft.papers.push({
            id: bp.paperId,
            title: bp.title,
            authors: bp.firstAuthor ? [bp.firstAuthor] : [],
            abstract: "",
            year: bp.year,
            doi: bp.doi,
            pdfLink: null,
            citationCount: null,
            publisher: null,
            sources: ["Seminar bundle"],
            sourceUrls: bp.doi
              ? [{ source: "Seminar bundle", url: `https://doi.org/${bp.doi}` }]
              : [],
            keywords: [],
            openAccess: null,
            paperType: null,
            venue: bp.venue,
            retrievedAt: now(),
          });
        }
        draft.projects.push({
          id,
          name: blind.name,
          question: blind.question,
          criteria: blind.criteria,
          members: blind.papers.map((bp) => ({
            paperId: bp.paperId,
            status: "unread" as const,
            decision: "unscreened" as const,
            reason: "",
            notes: "",
            tags: "",
          })),
          createdAt: now(),
        });
      });
      if (ok) setActiveProjectId(id);
      return ok;
    },
    [mutate]
  );

  // Repro lookups for Library + Compare: the most complete checklist across
  // all projects wins (any non-null answer beats an unset one).
  const reproByPaperId = useMemo(() => {
    const map: Record<string, Repro> = {};
    const score = (r: Repro) =>
      (r.code !== null ? 1 : 0) + (r.data !== null ? 1 : 0) +
      (r.seeds !== null ? 1 : 0) + (r.license ? 1 : 0);
    for (const proj of state.projects) {
      for (const m of proj.members) {
        if (!m.repro) continue;
        const current = map[m.paperId];
        if (!current || score(m.repro) > score(current)) {
          map[m.paperId] = m.repro;
        }
      }
    }
    return map;
  }, [state.projects]);

  // Capture Evidence (optionally anchored to a PDF document + page)
  const handleCaptureEvidence = useCallback(
    async (data: {
      statement: string;
      quote: string;
      field: Evidence["field"];
      kind: Evidence["kind"];
      documentId?: string;
      page?: number;
    }) => {
      if (!activeReaderPaper) return false;
      return mutate((draft) => {
        // Ensure paper is saved in workspace
        if (!draft.papers.some((p) => p.id === activeReaderPaper.id)) {
          draft.papers.push(activeReaderPaper);
        }
        // A page-anchored passage must point at a document that still exists.
        if (data.documentId) {
          const doc = draft.documents.find(
            (d) => d.id === data.documentId && d.paperId === activeReaderPaper.id,
          );
          if (!doc) return;
        }
        draft.evidence.push({
          id: uid(),
          paperId: activeReaderPaper.id,
          field: data.field,
          statement: data.statement,
          quote: data.quote,
          kind: data.kind,
          ...(data.documentId ? { documentId: data.documentId, page: data.page } : {}),
          createdAt: now(),
        });
      });
    },
    [activeReaderPaper, mutate]
  );

  // Delete Evidence
  const handleDeleteEvidence = useCallback(
    async (evidenceId: string) => {
      return mutate((draft) => {
        draft.evidence = draft.evidence.filter((e) => e.id !== evidenceId);
      });
    },
    [mutate]
  );

  /**
   * Attach an extracted PDF (pages + SHA-256) to the paper on the reading
   * desk. One document per paper keeps the page-anchor contract legible;
   * uploading a replacement drops the evidence anchored to the old pages
   * (those verbatim checks could never pass again) — the reader UI warns
   * before the swap is committed.
   */
  const handleAttachDocument = useCallback(
    (
      paper: Paper,
      doc: { name: string; hash: string; pages: Array<{ page: number; text: string }> },
    ) => {
      return mutate((draft) => {
        if (!draft.papers.some((p) => p.id === paper.id)) {
          draft.papers.push(paper);
        }
        const previous = draft.documents.filter((d) => d.paperId === paper.id);
        const previousIds = new Set(previous.map((d) => d.id));
        // Cascade: evidence anchored to a removed document cannot pass the
        // verbatim verifier any more — it goes with the document.
        if (previousIds.size > 0) {
          draft.evidence = draft.evidence.filter(
            (e) => !e.documentId || !previousIds.has(e.documentId),
          );
        }
        draft.documents = draft.documents.filter((d) => d.paperId !== paper.id);
        draft.documents.push({
          id: `doc-${doc.hash.slice(0, 12)}`,
          paperId: paper.id,
          name: doc.name,
          hash: doc.hash,
          pages: doc.pages,
          createdAt: now(),
        });
      });
    },
    [mutate]
  );

  // Remove a PDF and its anchored evidence (the reader confirms first).
  const handleDeleteDocument = useCallback(
    (documentId: string) => {
      return mutate((draft) => {
        draft.documents = draft.documents.filter((d) => d.id !== documentId);
        draft.evidence = draft.evidence.filter((e) => e.documentId !== documentId);
      });
    },
    [mutate]
  );

  // Create Alert
  const handleCreateAlert = useCallback(
    (alertQuery: string, frequency: "daily" | "weekly") => {
      void mutate((draft) => {
        draft.alerts.push({
          id: uid(),
          query: alertQuery,
          filters: {},
          providers: selectedProviders,
          frequency,
          lastRunAt: null,
          seen: [],
          createdAt: now(),
        });
      });
    },
    [selectedProviders, mutate]
  );

  // Delete Alert
  const handleDeleteAlert = useCallback(
    (alertId: string) => {
      void mutate((draft) => {
        draft.alerts = draft.alerts.filter((a) => a.id !== alertId);
      });
    },
    [mutate]
  );

  /**
   * Run an alert check immediately (no background worker required): query the
   * live academic sources, diff against the alert's seen IDs, and deliver any
   * newly discovered records straight into the local inbox.
   */
  const handleRunAlert = useCallback(
    async (alertId: string): Promise<{ found: number; error?: string }> => {
      const alert = state.alerts.find((a) => a.id === alertId);
      if (!alert) return { found: 0, error: "Alert not found" };

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: alert.query,
            filters: {},
            sources: alert.providers.length > 0 ? alert.providers : ["Crossref", "arXiv", "Europe PMC"],
          }),
        });
        if (!res.ok) {
          return { found: 0, error: "The live search failed. Try again in a moment." };
        }
        const data = await res.json();
        const papers: Paper[] = Array.isArray(data.papers) ? data.papers : [];
        const seenSet = new Set(alert.seen);
        const fresh = papers.filter((p) => !seenSet.has(p.id));

        if (fresh.length > 0) {
          await mutate((draft) => {
            const target = draft.alerts.find((a) => a.id === alertId);
            if (target) {
              for (const p of fresh) {
                target.seen.push(p.id);
                draft.inbox.unshift({
                  id: uid(),
                  alertId,
                  paper: p,
                  discoveredAt: now(),
                  read: false,
                });
              }
              if (target.seen.length > 20000) {
                target.seen = target.seen.slice(-20000);
              }
              target.lastRunAt = now();
            }
            if (draft.inbox.length > 2000) {
              draft.inbox = draft.inbox.slice(0, 2000);
            }
          });
        } else {
          // Even an empty result establishes a baseline timestamp
          void mutate((draft) => {
            const target = draft.alerts.find((a) => a.id === alertId);
            if (target) target.lastRunAt = now();
          });
        }
        return { found: fresh.length };
      } catch {
        return { found: 0, error: "The check could not reach the sources." };
      }
    },
    [state.alerts, mutate]
  );

  // Mark Inbox Read
  const handleMarkInboxRead = useCallback(
    (inboxId: string) => {
      void mutate((draft) => {
        const item = draft.inbox.find((i) => i.id === inboxId);
        if (item) item.read = true;
      });
    },
    [mutate]
  );

  // Mark All Inbox Read
  const handleMarkAllInboxRead = useCallback(() => {
    void mutate((draft) => {
      draft.inbox.forEach((i) => {
        i.read = true;
      });
    });
  }, [mutate]);

  // Export Snapshot
  const handleExportSnapshot = useCallback(() => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kivo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workspace backup downloaded", {
      description: `${state.papers.length} papers · ${state.projects.length} projects · ${state.evidence.length} evidence records`,
    });
  }, [state]);

  // Collect all papers known to the workspace
  const allKnownPapers = useMemo(() => {
    const map = new Map<string, Paper>();
    state.papers.forEach((p) => map.set(p.id, p));
    searchResults.forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p);
    });
    if (activeReaderPaper && !map.has(activeReaderPaper.id)) {
      map.set(activeReaderPaper.id, activeReaderPaper);
    }
    return Array.from(map.values());
  }, [state.papers, searchResults, activeReaderPaper]);

  // Compared papers list
  const comparedPapers = useMemo(() => {
    const map = new Map<string, Paper>(allKnownPapers.map((p) => [p.id, p]));
    return state.compare
      .map((id) => map.get(id))
      .filter((p): p is Paper => Boolean(p));
  }, [state.compare, allKnownPapers]);

  // Due flashcards (drives the nav badge) — derived, never stored twice
  const dueReviewCount = useMemo(
    () => dueQueue(buildFlashcards(state.evidence, state.reviews)).length,
    [state.evidence, state.reviews],
  );

  // Grade a flashcard: advance the SM-2 schedule and log the attempt
  const handleGradeEvidence = useCallback(
    (evidenceId: string, grade: Grade) => {
      void mutate((draft) => {
        const index = draft.reviews.findIndex(
          (r) => r.evidenceId === evidenceId,
        );
        const current =
          index >= 0
            ? draft.reviews[index]
            : {
                evidenceId,
                ease: 2.5,
                intervalDays: 0,
                dueAt: new Date(0).toISOString(),
                reps: 0,
                lapses: 0,
                lastReviewedAt: null,
                suspended: false,
              };
        const next = applyGrade(current, grade);
        if (index >= 0) {
          draft.reviews[index] = next;
        } else {
          draft.reviews.push(next);
        }
        draft.reviewLog.push({
          evidenceId,
          grade,
          at: new Date().toISOString(),
        });
        if (draft.reviewLog.length > 5000) {
          draft.reviewLog = draft.reviewLog.slice(-5000);
        }
      });
    },
    [mutate],
  );

  // Suspend / resume a flashcard without deleting its evidence
  const handleToggleSuspend = useCallback(
    (evidenceId: string) => {
      void mutate((draft) => {
        const index = draft.reviews.findIndex(
          (r) => r.evidenceId === evidenceId,
        );
        if (index >= 0) {
          draft.reviews[index].suspended = !draft.reviews[index].suspended;
        } else {
          draft.reviews.push({
            evidenceId,
            ease: 2.5,
            intervalDays: 0,
            dueAt: new Date(0).toISOString(),
            reps: 0,
            lapses: 0,
            lastReviewedAt: null,
            suspended: true,
          });
        }
      });
    },
    [mutate],
  );

  // Open a paper in the Reader from anywhere
  const handleOpenReaderFromAnywhere = useCallback(
    (paper: Paper) => {
      handleOpenReader(paper);
    },
    [handleOpenReader],
  );

  // Send a paper to the citation map explorer
  const handleExploreGraph = useCallback(
    (paper: Paper) => {
      // The map works off the saved library — ensure the paper is in it.
      if (!state.papers.some((p) => p.id === paper.id)) {
        handleToggleSave(paper);
      }
      setGraphCenterId(paper.id);
      setCurrentSection("graph");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [state.papers, handleToggleSave],
  );

  // ============ ARGUMENT BUILDER (FUTURE_FEATURES #10) ============

  const handleCreateClaim = useCallback(
    (text: string) => {
      void mutate((draft) => {
        if (draft.claims.length >= 100) return;
        draft.claims.push({
          id: uid(),
          text,
          notes: "",
          evidence: [],
          createdAt: now(),
          updatedAt: now(),
        });
      });
      toast.success("Claim staked", {
        description: "Now attach receipts from the evidence pool — a claim without them is just an assertion.",
      });
    },
    [mutate],
  );

  const handleUpdateClaimText = useCallback(
    (claimId: string, text: string) => {
      void mutate((draft) => {
        const claim = draft.claims.find((c) => c.id === claimId);
        if (claim) {
          claim.text = text;
          claim.updatedAt = now();
        }
      });
    },
    [mutate],
  );

  const handleUpdateClaimNotes = useCallback(
    (claimId: string, notes: string) => {
      void mutate((draft) => {
        const claim = draft.claims.find((c) => c.id === claimId);
        if (claim) {
          claim.notes = notes;
          claim.updatedAt = now();
        }
      });
    },
    [mutate],
  );

  const handleDeleteClaim = useCallback(
    (claimId: string) => {
      void mutate((draft) => {
        draft.claims = draft.claims.filter((c) => c.id !== claimId);
      });
      toast.info("Claim removed", {
        description: "The evidence itself stays on the desk — only the claim is gone.",
      });
    },
    [mutate],
  );

  const handleAttachEvidenceToClaim = useCallback(
    (claimId: string, evidenceId: string, stance: ClaimStance) => {
      void mutate((draft) => {
        const claim = draft.claims.find((c) => c.id === claimId);
        if (!claim) return;
        if (claim.evidence.some((l) => l.evidenceId === evidenceId)) return;
        if (claim.evidence.length >= 200) return;
        claim.evidence.push({ evidenceId, stance, note: "" });
        claim.updatedAt = now();
      });
    },
    [mutate],
  );

  const handleSetClaimStance = useCallback(
    (claimId: string, evidenceId: string, stance: ClaimStance) => {
      void mutate((draft) => {
        const claim = draft.claims.find((c) => c.id === claimId);
        const link = claim?.evidence.find((l) => l.evidenceId === evidenceId);
        if (claim && link) {
          link.stance = stance;
          claim.updatedAt = now();
        }
      });
    },
    [mutate],
  );

  const handleDetachEvidenceFromClaim = useCallback(
    (claimId: string, evidenceId: string) => {
      void mutate((draft) => {
        const claim = draft.claims.find((c) => c.id === claimId);
        if (claim) {
          claim.evidence = claim.evidence.filter((l) => l.evidenceId !== evidenceId);
          claim.updatedAt = now();
        }
      });
    },
    [mutate],
  );

  const handleSetClaimLinkNote = useCallback(
    (claimId: string, evidenceId: string, note: string) => {
      void mutate((draft) => {
        const claim = draft.claims.find((c) => c.id === claimId);
        const link = claim?.evidence.find((l) => l.evidenceId === evidenceId);
        if (claim && link) {
          link.note = note;
          claim.updatedAt = now();
        }
      });
    },
    [mutate],
  );

  // Claims still standing on assertions — drives the Builder nav badge
  const unbackedClaimsCount = useMemo(
    () => state.claims.filter((c) => claimStatus(c) === "unbacked").length,
    [state.claims],
  );

  return (
    <WorkspaceShell
      currentSection={currentSection}
      onNavigate={setCurrentSection}
      storageStatus={storageStatus}
      savedCount={state.papers.length}
      compareCount={state.compare.length}
      unreadAlertsCount={state.inbox.filter((i) => !i.read).length}
      dueReviewCount={dueReviewCount}
      unbackedClaimsCount={unbackedClaimsCount}
      onExportSnapshot={handleExportSnapshot}
    >
      {/* 1. Discover View */}
      {currentSection === "discover" && (
        <DiscoverView
          query={searchQuery}
          setQuery={setSearchQuery}
          selectedProviders={selectedProviders}
          setSelectedProviders={setSelectedProviders}
          filters={filters}
          setFilters={setFilters}
          onSearch={handleSearch}
          isSearching={isSearching}
          results={searchResults}
          diagnostics={diagnostics}
          recentSearches={state.searches}
          savedPaperIds={savedPaperIds}
          comparedPaperIds={comparedPaperIds}
          onToggleSave={handleToggleSave}
          onToggleCompare={handleToggleCompare}
          onOpenReader={handleOpenReader}
          onAddToProject={handleAddToProject}
        />
      )}

      {/* 2. Reader View */}
      {currentSection === "reading" &&
        (activeReaderPaper ? (
          <ReaderView
            paper={activeReaderPaper}
            onBack={() => setCurrentSection("discover")}
            isSaved={savedPaperIds.has(activeReaderPaper.id)}
            isCompared={comparedPaperIds.has(activeReaderPaper.id)}
            onToggleSave={handleToggleSave}
            onToggleCompare={handleToggleCompare}
            onExploreGraph={handleExploreGraph}
            workspaceEvidence={state.evidence}
            document={
              state.documents.find((d) => d.paperId === activeReaderPaper.id) ?? null
            }
            onAttachDocument={handleAttachDocument}
            onDeleteDocument={handleDeleteDocument}
            onCaptureEvidence={handleCaptureEvidence}
            onDeleteEvidence={handleDeleteEvidence}
          />
        ) : (
          <div className="bench-card p-12 sm:p-16 text-center max-w-xl mx-auto space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--cyan-wash)] text-[var(--cyan-ink)] hatch">
              <BookOpen className="h-8 w-8" strokeWidth={2} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold font-display">Nothing on the reading desk</h3>
              <p className="text-sm sm:text-base text-[var(--ink-body)] leading-relaxed">
                Pick any record from discovery or your library to read its abstract,
                verify passages, and capture evidence against the standard fields.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCurrentSection("discover")}
                className="btn btn-primary h-11 px-6 text-xs font-mono uppercase tracking-wider"
              >
                <Compass className="w-4 h-4" strokeWidth={2.4} />
                <span>Discover literature</span>
              </button>
            </div>
          </div>
        ))}

      {/* 3. Saved Vault View */}
      {currentSection === "saved" && (
        <SavedView
          papers={state.papers}
          comparedPaperIds={comparedPaperIds}
          onToggleSave={handleToggleSave}
          onToggleCompare={handleToggleCompare}
          onOpenReader={handleOpenReader}
          onNavigateToDiscover={() => setCurrentSection("discover")}
          onAddToProject={handleAddToProject}
          onImportPapers={handleImportPapers}
          reproByPaperId={reproByPaperId}
        />
      )}

      {/* 4. Projects & Screening View */}
      {currentSection === "projects" && (
        <ProjectsView
          projects={state.projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProjectId}
          onCreateProject={handleCreateProject}
          onUpdateMemberDecision={handleUpdateMemberDecision}
          onUpdateMemberRepro={handleUpdateMemberRepro}
          onExportBundle={handleExportSeminarBundle}
          onImportBlind={handleImportSeminarBundle}
          allPapers={allKnownPapers}
          evidenceList={state.evidence}
          searches={state.searches}
          onOpenReader={handleOpenReader}
        />
      )}

      {/* 5. Compare Studio View */}
      {currentSection === "compare" && (
        <CompareView
          comparedPapers={comparedPapers}
          onRemovePaper={handleRemoveFromCompare}
          onClearAll={handleClearCompare}
          onOpenReader={handleOpenReader}
          onNavigateToDiscover={() => setCurrentSection("discover")}
          evidenceList={state.evidence}
          reproByPaperId={reproByPaperId}
        />
      )}

      {/* 6. Alerts Radar View */}
      {currentSection === "updates" && (
        <UpdatesView
          inbox={state.inbox}
          alerts={state.alerts}
          onMarkRead={handleMarkInboxRead}
          onMarkAllRead={handleMarkAllInboxRead}
          onCreateAlert={handleCreateAlert}
          onDeleteAlert={handleDeleteAlert}
          onRunAlert={handleRunAlert}
          onOpenReader={handleOpenReader}
          onToggleSave={handleToggleSave}
          savedPaperIds={savedPaperIds}
        />
      )}

      {/* 7. Review — evidence flashcards with spaced repetition */}
      {currentSection === "review" && (
        <ReviewView
          papers={state.papers}
          evidence={state.evidence}
          reviews={state.reviews}
          reviewLog={state.reviewLog}
          events={state.events}
          onGrade={handleGradeEvidence}
          onToggleSuspend={handleToggleSuspend}
          onOpenPaper={handleOpenReaderFromAnywhere}
          onNavigateToReader={() => setCurrentSection("reading")}
        />
      )}

      {/* 8. Citation map — force-directed explorer */}
      {currentSection === "graph" && (
        <GraphView
          papers={state.papers}
          initialPaperId={graphCenterId}
          onOpenReader={handleOpenReaderFromAnywhere}
          onToggleSave={handleToggleSave}
          savedPaperIds={savedPaperIds}
        />
      )}

      {/* 9. Builder — claims + evidence → Toulmin map + outline */}
      {currentSection === "builder" && (
        <BuilderView
          claims={state.claims}
          evidence={state.evidence}
          papers={state.papers}
          onCreateClaim={handleCreateClaim}
          onUpdateClaimText={handleUpdateClaimText}
          onUpdateClaimNotes={handleUpdateClaimNotes}
          onDeleteClaim={handleDeleteClaim}
          onAttachEvidence={handleAttachEvidenceToClaim}
          onSetStance={handleSetClaimStance}
          onDetachEvidence={handleDetachEvidenceFromClaim}
          onSetLinkNote={handleSetClaimLinkNote}
          onOpenPaper={handleOpenReaderFromAnywhere}
          onNavigateToReader={() => setCurrentSection("reading")}
          onNavigateToDiscover={() => setCurrentSection("discover")}
        />
      )}
    </WorkspaceShell>
  );
}
