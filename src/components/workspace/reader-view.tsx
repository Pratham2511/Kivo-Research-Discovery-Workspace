"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Scale,
  FileText,
  ExternalLink,
  Quote,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  PlusCircle,
  Network,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  Timer,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { DocumentRecord, Evidence } from "@/lib/workspace/schema";
import { fields } from "@/lib/workspace/schema";
import { resolvePaperAccess } from "./source-resolver";
import { StancePanel } from "./stance-panel";
import { AskPanel } from "./ask-panel";
import { JargonPanel } from "./jargon-panel";
import { FocusTimerOverlay } from "./focus-timer";
import type { Paper } from "./paper-card";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

interface ReaderViewProps {
  paper: Paper;
  onBack: () => void;
  isSaved: boolean;
  isCompared: boolean;
  onToggleSave: (p: Paper) => void;
  onToggleCompare: (p: Paper) => void;
  onExploreGraph: (p: Paper) => void;
  workspaceEvidence: Evidence[];
  document: DocumentRecord | null;
  onAttachDocument: (
    p: Paper,
    doc: { name: string; hash: string; pages: Array<{ page: number; text: string }> },
  ) => Promise<boolean>;
  onDeleteDocument: (documentId: string) => Promise<boolean>;
  onCaptureEvidence: (data: {
    statement: string;
    quote: string;
    field: Evidence["field"];
    kind: Evidence["kind"];
    documentId?: string;
    page?: number;
  }) => Promise<boolean>;
  onDeleteEvidence: (evidenceId: string) => Promise<boolean>;
}

type CaptureMessage = { type: "success" | "error" | "info"; text: string };
type CaptureSource = "abstract" | "pdf";

export function ReaderView({
  paper,
  onBack,
  isSaved,
  isCompared,
  onToggleSave,
  onToggleCompare,
  onExploreGraph,
  workspaceEvidence,
  document,
  onAttachDocument,
  onDeleteDocument,
  onCaptureEvidence,
  onDeleteEvidence,
}: ReaderViewProps) {
  const access = resolvePaperAccess(paper);
  const paperEvidence = workspaceEvidence.filter((e) => e.paperId === paper.id);

  const [selectedField, setSelectedField] = useState<Evidence["field"]>("Findings");
  const [evidenceKind, setEvidenceKind] = useState<Evidence["kind"]>("author passage");
  const [textInput, setTextInput] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<CaptureMessage | null>(null);

  // ---- PDF document state -------------------------------------------------
  const [activePage, setActivePage] = useState(1);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState<CaptureMessage | null>(null);
  const [confirmRemoveDoc, setConfirmRemoveDoc] = useState(false);
  const [captureSource, setCaptureSource] = useState<CaptureSource>("abstract");

  // ---- Focus session state ------------------------------------------------
  const [focusSession, setFocusSession] = useState(false);
  const [sessionCaptures, setSessionCaptures] = useState(0);

  const abstractRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Source flash — briefly outlines the abstract or a PDF page when a
  // grounded answer receipt sends the reader to its evidence.
  const [flashTarget, setFlashTarget] = useState<"abstract" | number | null>(null);
  useEffect(() => {
    if (flashTarget === null) return;
    const id = window.setTimeout(() => setFlashTarget(null), 1600);
    return () => window.clearTimeout(id);
  }, [flashTarget]);

  const handleGoToPage = useCallback(
    (page: number) => {
      if (page === 0) {
        abstractRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashTarget("abstract");
      } else {
        if (document) setActivePage(Math.min(page, document.pages.length));
        requestAnimationFrame(() => {
          pageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        setFlashTarget(page);
      }
    },
    [document],
  );

  // Reset all per-paper state when the reader switches papers.
  useEffect(() => {
    setActivePage(1);
    setTextInput("");
    setEvidenceKind("author passage");
    setCaptureSource("abstract");
    setCaptureMessage(null);
    setExtractMessage(null);
    setConfirmRemoveDoc(false);
    setFocusSession(false);
    setSessionCaptures(0);
  }, [paper.id]);

  const currentPage = useMemo(
    () => document?.pages.find((p) => p.page === activePage) ?? null,
    [document, activePage],
  );
  const activeSourceText =
    captureSource === "pdf" ? (currentPage?.text ?? "") : paper.abstract;

  const anchoredEvidenceCount = useMemo(
    () => (document ? paperEvidence.filter((e) => e.documentId === document.id).length : 0),
    [document, paperEvidence],
  );

  const trimmedInput = textInput.trim();
  const isVerbatimExcerpt =
    evidenceKind === "researcher note"
      ? trimmedInput.length > 0
      : trimmedInput.length > 0 && activeSourceText.includes(trimmedInput);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection) return;
    const selected = selection.toString().trim();
    if (selected.length < 5) return;
    if (abstractRef.current && abstractRef.current.contains(selection.anchorNode)) {
      setTextInput(selected);
      setEvidenceKind("author passage");
      setCaptureSource("abstract");
      setCaptureMessage({
        type: "info",
        text: "Abstract passage captured to the quote input. Verify and capture.",
      });
    }
  };

  const handlePageSelection = () => {
    const selection = window.getSelection();
    if (!selection) return;
    const selected = selection.toString().trim();
    if (selected.length < 5) return;
    if (pageRef.current && pageRef.current.contains(selection.anchorNode)) {
      setTextInput(selected);
      setEvidenceKind("author passage");
      setCaptureSource("pdf");
      setCaptureMessage({
        type: "info",
        text: `Page ${activePage} passage captured. It will anchor to this exact page.`,
      });
    }
  };

  // ---- PDF upload ---------------------------------------------------------
  const handleFileChosen = async (file: File | null | undefined) => {
    if (!file) return;
    setConfirmRemoveDoc(false);
    if (file.size > MAX_UPLOAD_BYTES) {
      setExtractMessage({
        type: "error",
        text: "PDFs up to 15 MB are supported — this one is larger.",
      });
      return;
    }
    setIsExtracting(true);
    setExtractMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.pages)) {
        setExtractMessage({
          type: "error",
          text:
            typeof data?.error === "string"
              ? data.error
              : "Text extraction failed. Try another file.",
        });
        return;
      }
      const ok = await onAttachDocument(paper, {
        name: typeof data.name === "string" ? data.name : file.name,
        hash: data.hash,
        pages: data.pages,
      });
      if (ok) {
        setActivePage(1);
        setExtractMessage({
          type: "success",
          text: `Extracted ${data.pages.length} ${data.pages.length === 1 ? "page" : "pages"}. Highlight any passage — it anchors to the page it came from.`,
        });
      } else {
        setExtractMessage({
          type: "error",
          text: "The document could not be stored in this workspace.",
        });
      }
    } catch {
      setExtractMessage({
        type: "error",
        text: "Upload failed — the extraction service could not be reached.",
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveDocument = async () => {
    if (!document) return;
    const ok = await onDeleteDocument(document.id);
    if (ok) {
      setConfirmRemoveDoc(false);
      setCaptureSource("abstract");
      setActivePage(1);
      toast.success("PDF removed", {
        description:
          anchoredEvidenceCount > 0
            ? `${anchoredEvidenceCount} page-anchored ${anchoredEvidenceCount === 1 ? "record" : "records"} went with it — their verbatim checks could no longer pass.`
            : "No evidence was anchored to it.",
      });
    }
  };

  const handleSaveEvidence = async () => {
    setCaptureMessage(null);

    if (!trimmedInput) {
      setCaptureMessage({
        type: "error",
        text:
          evidenceKind === "author passage"
            ? "Enter or highlight a verbatim passage first."
            : "Write a synthesis note before saving.",
      });
      return;
    }

    if (evidenceKind === "author passage" && !activeSourceText.includes(trimmedInput)) {
      setCaptureMessage({
        type: "error",
        text:
          captureSource === "pdf"
            ? `Author passages must be verbatim excerpts from page ${activePage}. Paraphrases belong to researcher notes.`
            : "Author passages must be verbatim excerpts from the abstract. Paraphrases belong to researcher notes.",
      });
      return;
    }

    setIsCapturing(true);
    try {
      const anchored =
        evidenceKind === "author passage" &&
        captureSource === "pdf" &&
        document !== null;
      const success = await onCaptureEvidence({
        field: selectedField,
        kind: evidenceKind,
        statement: trimmedInput,
        quote: evidenceKind === "author passage" ? trimmedInput : "",
        ...(anchored ? { documentId: document.id, page: activePage } : {}),
      });

      if (success) {
        setTextInput("");
        if (focusSession) setSessionCaptures((n) => n + 1);
        setCaptureMessage({
          type: "success",
          text: anchored
            ? `Evidence captured — anchored to PDF page ${activePage}.`
            : "Evidence captured to the workspace.",
        });
        setTimeout(() => setCaptureMessage(null), 3500);
      } else {
        setCaptureMessage({
          type: "error",
          text: "Could not save evidence. Try again in a moment.",
        });
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDelete = async (evidenceId: string) => {
    await onDeleteEvidence(evidenceId);
  };

  const authorsDisplay =
    paper.authors.length > 0
      ? paper.authors.slice(0, 6).join(", ") +
        (paper.authors.length > 6 ? ` et al. (+${paper.authors.length - 6})` : "")
      : "Unknown authors";

  return (
    <div className="space-y-7">
      {focusSession && (
        <FocusTimerOverlay
          paperTitle={paper.title}
          capturedCount={sessionCaptures}
          onEnd={() => {
            setFocusSession(false);
            if (sessionCaptures > 0) {
              toast.success(`Session logged: ${sessionCaptures} ${sessionCaptures === 1 ? "capture" : "captures"}`);
            }
          }}
        />
      )}

      {/* ====================== MASTHEAD ====================== */}
      <header className="space-y-4 animate-rise">
        <div className="flex flex-wrap items-center gap-3">
          <span className="stamp-label">
            <span className="stamp-num">02</span> / Reader
          </span>
          <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[40px]" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.4} />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleSave(paper)}
              className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                isSaved ? "btn-accent-yellow !shadow-none" : "btn-ghost"
              }`}
              title={isSaved ? "Remove from library" : "Save to library"}
              aria-pressed={isSaved}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`} strokeWidth={2.2} />
              <span>{isSaved ? "Saved" : "Save"}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleCompare(paper)}
              className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                isCompared ? "btn-accent-orange !shadow-none" : "btn-ghost"
              }`}
              title="Compare side-by-side"
              aria-pressed={isCompared}
            >
              <Scale className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>{isCompared ? "Comparing" : "Compare"}</span>
            </button>
            <button
              type="button"
              onClick={() => onExploreGraph(paper)}
              className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
              title="Map this paper's references and citations"
            >
              <Network className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Map citations</span>
            </button>
            <button
              type="button"
              onClick={() => setFocusSession(true)}
              className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider hover:!border-[var(--orange)] hover:!text-[var(--orange-ink)]"
              title="Start a 25-minute focus session on this paper"
            >
              <Timer className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>Focus</span>
            </button>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold font-display leading-[1.08] pt-1">
          {paper.title}
        </h1>

        <p className="text-base sm:text-lg text-[var(--ink-body)] italic">
          {authorsDisplay}
        </p>

        {/* Metadata strip */}
        <div className="flex flex-wrap items-center gap-2">
          {paper.year && (
            <span
              className="font-mono text-[11px] font-bold px-2 py-[3px] border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper-dim)] text-[var(--ink-heading)]"
              title="Publication year"
            >
              {paper.year}
            </span>
          )}
          {paper.venue && (
            <span
              className="max-w-[320px] truncate ticket"
              style={{ textTransform: "none", letterSpacing: "0.02em" }}
              title={paper.venue}
            >
              {paper.venue}
            </span>
          )}
          {paper.citationCount !== null && (
            <span className="ticket ticket-violet">
              <span>{paper.citationCount} {paper.citationCount === 1 ? "cite" : "cites"}</span>
            </span>
          )}
          <span
            className={`ticket ${access.accessBadge.variant === "emerald" ? "ticket-green" : "ticket-cyan"}`}
            title={access.accessBadge.tooltip}
          >
            <span>{access.accessBadge.label}</span>
          </span>
          {paper.doi && (
            <span className="font-mono text-[11px] text-[var(--ink-muted)] truncate max-w-[280px]">
              DOI: {paper.doi}
            </span>
          )}
        </div>

        <hr className="ledger-rule" />
      </header>

      {/* ====================== TWO-COLUMN BODY ====================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* ============ LEFT: abstract + PDF + stance + access + evidence ============ */}
        <div className="lg:col-span-7 space-y-6">
          {/* Abstract panel */}
          <section className="bench-card p-6 sm:p-7 space-y-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <BookOpen className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Abstract</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[30px]" />
              <span className="font-mono text-[9.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider hidden sm:inline">
                Highlight to capture
              </span>
            </div>

            {paper.abstract ? (
              <div
                ref={abstractRef}
                onMouseUp={handleTextSelection}
                className={`text-[15px] sm:text-base text-[var(--ink-body)] leading-[1.8] whitespace-pre-line select-text border-l-4 border-[var(--yellow)] pl-4 transition-shadow ${
                  flashTarget === "abstract" ? "source-flash" : ""
                }`}
              >
                {paper.abstract}
              </div>
            ) : (
              <div className="hatch border-2 border-dashed border-[var(--border-soft)] rounded-[var(--radius-cut)] p-8 text-center text-xs text-[var(--ink-muted)] font-mono uppercase tracking-wider">
                Abstract not provided in the index record. Open the original paper via the access block below.
              </div>
            )}
          </section>

          {/* Reading level & jargon heatmap (approachability layer) */}
          <JargonPanel paper={paper} />

          {/* ============ Full-text PDF panel (page-anchored evidence) ============ */}
          <section className="bench-card p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <FileText className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Full text (PDF)</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[30px]" />
              {document && (
                <span className="ticket ticket-cyan !py-0.5">
                  <span>{document.pages.length} {document.pages.length === 1 ? "page" : "pages"}</span>
                </span>
              )}
            </div>

            {!document && (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void handleFileChosen(e.dataTransfer.files?.[0]);
                  }}
                  className={`hatch cursor-pointer border-2 border-dashed rounded-[var(--radius-cut)] px-6 py-8 text-center space-y-3 transition-colors ${
                    dragOver
                      ? "border-[var(--cyan)] bg-[var(--cyan-wash)]"
                      : "border-[var(--border-soft)] hover:border-[var(--cyan)]"
                  }`}
                  aria-label="Upload the paper PDF for page-anchored evidence"
                >
                  <div className="mx-auto flex h-11 w-11 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--bg-paper)] text-[var(--cyan-ink)]">
                    {isExtracting ? (
                      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} />
                    ) : (
                      <UploadCloud className="h-5 w-5" strokeWidth={2.2} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold font-display text-[var(--ink-heading)]">
                      {isExtracting ? "Extracting pages…" : "Drop the paper's PDF here"}
                    </p>
                    <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
                      Or click to browse · PDF ≤ 15 MB · text extracted per page, stored locally
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => void handleFileChosen(e.target.files?.[0])}
                />
                <p className="font-mono text-[9.5px] text-[var(--ink-muted)] leading-relaxed uppercase tracking-wider">
                  Evidence quoted from a PDF anchors to its exact page — the defensible version of “quote from the full text.”
                </p>
              </>
            )}

            {document && (
              <>
                {/* Page toolbar */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                      disabled={activePage <= 1}
                      className="btn btn-ghost btn-chip !p-1.5"
                      title="Previous page"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.4} />
                    </button>
                    <select
                      value={activePage}
                      onChange={(e) => setActivePage(Number(e.target.value))}
                      className="field-input !w-auto !py-1.5 !px-2.5 font-mono text-[11px] font-bold"
                      aria-label="Go to page"
                    >
                      {document.pages.map((p) => (
                        <option key={p.page} value={p.page}>
                          Page {p.page}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setActivePage((p) => Math.min(document.pages.length, p + 1))
                      }
                      disabled={activePage >= document.pages.length}
                      className="btn btn-ghost btn-chip !p-1.5"
                      title="Next page"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.4} />
                    </button>
                  </div>
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                    {activePage} / {document.pages.length}
                  </span>
                  <span className="flex-1" />
                  {!confirmRemoveDoc ? (
                    <button
                      type="button"
                      onClick={() =>
                        anchoredEvidenceCount > 0
                          ? setConfirmRemoveDoc(true)
                          : void handleRemoveDocument()
                      }
                      className="btn btn-ghost btn-chip !p-1.5 hover:!border-[var(--red)] hover:!text-[var(--red-ink)]"
                      title="Remove this PDF and its anchored evidence"
                      aria-label="Remove this PDF"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[var(--red-ink)]">
                        Remove {anchoredEvidenceCount} anchored {anchoredEvidenceCount === 1 ? "record" : "records"} too?
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveDocument()}
                        className="btn btn-accent-red btn-chip text-[10px] font-mono uppercase tracking-wider"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveDoc(false)}
                        className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                      >
                        Keep
                      </button>
                    </div>
                  )}
                </div>

                {/* Page text pane */}
                {currentPage && currentPage.text.trim().length > 0 ? (
                  <div
                    ref={pageRef}
                    onMouseUp={handlePageSelection}
                    className={`text-[13.5px] text-[var(--ink-body)] leading-[1.85] whitespace-pre-line select-text border-l-4 border-[var(--cyan)] pl-4 bench-scroll max-h-[26rem] overflow-y-auto pr-2 transition-shadow ${
                      flashTarget === activePage ? "source-flash" : ""
                    }`}
                  >
                    {currentPage.text}
                  </div>
                ) : (
                  <div className="hatch border-2 border-dashed border-[var(--border-soft)] rounded-[var(--radius-cut)] p-6 text-center font-mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">
                    No text layer on page {activePage} — it may be a figure, a scan, or the title page.
                  </div>
                )}

                <p className="font-mono text-[9.5px] text-[var(--ink-muted)] leading-relaxed uppercase tracking-wider border-t-2 border-dotted border-[var(--border-soft)] pt-2.5">
                  {document.name} · SHA-256 {document.hash.slice(0, 16)}… · highlight any passage to anchor it to page {activePage}
                </p>
              </>
            )}

            {extractMessage && (
              <div
                className={`flex items-start gap-2 border-2 rounded-[var(--radius-cut)] px-3 py-2.5 text-xs font-bold ${
                  extractMessage.type === "success"
                    ? "border-[var(--green)] bg-[var(--green-wash)] text-[var(--green-ink)]"
                    : extractMessage.type === "error"
                      ? "border-[var(--red)] bg-[var(--red-wash)] text-[var(--red-ink)]"
                      : "border-[var(--cyan)] bg-[var(--cyan-wash)] text-[var(--cyan-ink)]"
                }`}
                role="status"
              >
                {extractMessage.type === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.4} />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.4} />
                )}
                <span className="leading-relaxed">{extractMessage.text}</span>
              </div>
            )}
          </section>

          {/* ============ Grounded Q&A ============ */}
          <AskPanel paper={paper} document={document} onGoToPage={handleGoToPage} />

          {/* ============ Smart citations ============ */}
          <StancePanel paper={paper} />

          {/* Access & provenance */}
          <section className="bench-card p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Access &amp; provenance</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`ticket ${access.hasDirectPdf ? "ticket-green" : "ticket-cyan"} py-1.5 px-3`}>
                <span>{access.accessBadge.label}</span>
              </span>

              {access.primaryAction && (
                <a
                  href={access.primaryAction.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                    access.hasDirectPdf ? "btn-accent-green" : "btn-ghost"
                  }`}
                >
                  {access.hasDirectPdf ? (
                    <FileText className="w-3.5 h-3.5" strokeWidth={2.2} />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.2} />
                  )}
                  <span>{access.hasDirectPdf ? "View PDF" : "View at source"}</span>
                  <ArrowUpRight className="w-3 h-3" strokeWidth={2.4} />
                </a>
              )}

              {access.secondaryActions.slice(0, 2).map((action) => (
                <a
                  key={action.url}
                  href={action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-chip text-[10px] font-mono uppercase tracking-wider"
                  title={action.label}
                >
                  <ExternalLink className="w-3 h-3" strokeWidth={2.2} />
                  <span>{action.label}</span>
                </a>
              ))}
            </div>

            <p className="font-mono text-[9.5px] text-[var(--ink-muted)] leading-relaxed uppercase tracking-wider border-t-2 border-dotted border-[var(--border-soft)] pt-3">
              Access paths resolve directly from upstream repository metadata — no uploads, no mirrors, no model intermediaries.
            </p>
          </section>

          {/* Evidence list */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Quote className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Captured evidence</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
              <span className="font-mono text-[10.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                {paperEvidence.length} {paperEvidence.length === 1 ? "record" : "records"}
              </span>
            </div>

            {paperEvidence.length === 0 ? (
              <div className="bench-card p-8 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center border-2 border-[var(--border-ink)] rounded-[var(--radius-cut)] bg-[var(--cyan-wash)] text-[var(--cyan-ink)] hatch">
                  <Quote className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <p className="text-base text-[var(--ink-body)] italic">
                  No evidence captured yet for this paper.
                </p>
                <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
                  Highlight a passage in the abstract or the PDF pages above, or write a synthesis note using the capture panel.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {paperEvidence.map((ev) => (
                  <article key={ev.id} className="paper-slip p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ticket ticket-cyan">
                          <span>{ev.field}</span>
                        </span>
                        <span className={`ticket ${ev.kind === "author passage" ? "ticket-green" : "ticket-orange"}`}>
                          <span>{ev.kind === "author passage" ? "Passage" : "Note"}</span>
                        </span>
                        {ev.documentId && (
                          <span className="ticket ticket-yellow" title="Anchored to a stored PDF page">
                            <FileText className="w-3 h-3" strokeWidth={2.4} />
                            <span>PDF · p.{ev.page}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9.5px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">
                          {new Date(ev.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(ev.id)}
                          className="btn btn-ghost btn-chip !p-1.5 hover:!border-[var(--red)] hover:!text-[var(--red-ink)]"
                          title="Delete evidence"
                          aria-label="Delete evidence"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                    <p
                      className={`text-[13.5px] leading-relaxed ${
                        ev.kind === "author passage"
                          ? "italic border-l-4 border-[var(--green)] pl-3"
                          : "text-[var(--ink-body)]"
                      }`}
                    >
                      {ev.kind === "author passage" ? `\u201C${ev.statement}\u201D` : ev.statement}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ============ RIGHT: capture form (sticky) ============ */}
        <aside className="lg:col-span-5">
          <section className="bench-card p-5 sm:p-6 space-y-5 lg:sticky lg:top-6">
            <div className="flex items-center gap-2.5">
              <PlusCircle className="w-4 h-4 text-[var(--cyan-ink)]" strokeWidth={2.2} />
              <h2 className="stamp-label">
                <span className="stamp-underline">Capture evidence</span>
              </h2>
              <span className="h-0.5 flex-1 bg-[var(--border-soft)]" />
            </div>

            {/* Field selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="reader-field-select"
                className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] block"
              >
                Classification field
              </label>
              <select
                id="reader-field-select"
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value as Evidence["field"])}
                className="field-input"
              >
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {/* Kind toggle */}
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] block">
                Evidence kind
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEvidenceKind("author passage")}
                  className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                    evidenceKind === "author passage" ? "btn-accent-green !shadow-none" : "btn-ghost"
                  }`}
                  aria-pressed={evidenceKind === "author passage"}
                >
                  Author passage
                </button>
                <button
                  type="button"
                  onClick={() => setEvidenceKind("researcher note")}
                  className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                    evidenceKind === "researcher note" ? "btn-accent-orange !shadow-none" : "btn-ghost"
                  }`}
                  aria-pressed={evidenceKind === "researcher note"}
                >
                  Researcher note
                </button>
              </div>
            </div>

            {/* Source selector — visible once a PDF is attached */}
            {document && evidenceKind === "author passage" && (
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] block">
                  Verbatim source
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCaptureSource("abstract")}
                    className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                      captureSource === "abstract" ? "btn-accent-yellow !shadow-none" : "btn-ghost"
                    }`}
                    aria-pressed={captureSource === "abstract"}
                  >
                    Abstract
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureSource("pdf")}
                    className={`btn btn-chip text-[11px] font-mono uppercase tracking-wider ${
                      captureSource === "pdf" ? "btn-accent-cyan !shadow-none" : "btn-ghost"
                    }`}
                    aria-pressed={captureSource === "pdf"}
                  >
                    PDF · p.{activePage}
                  </button>
                </div>
                <p className="font-mono text-[9px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
                  Highlighting in either pane switches the source automatically.
                </p>
              </div>
            )}

            {/* Textarea */}
            <div className="space-y-1.5">
              <label
                htmlFor="reader-evidence-input"
                className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] block"
              >
                {evidenceKind === "author passage"
                  ? captureSource === "pdf"
                    ? `Verbatim quote — page ${activePage}`
                    : "Verbatim quote — abstract"
                  : "Synthesis note"}
              </label>
              <textarea
                id="reader-evidence-input"
                rows={5}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  evidenceKind === "author passage"
                    ? "Highlight any passage in the abstract or PDF pages above — or paste a verbatim excerpt here."
                    : "Write your own interpretation, critique, or synthesis of this paper."
                }
                className="field-input !leading-relaxed resize-y"
              />

              {evidenceKind === "author passage" && trimmedInput.length > 0 && (
                <div
                  className={`flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                    isVerbatimExcerpt ? "text-[var(--green-ink)]" : "text-[var(--red-ink)]"
                  }`}
                >
                  {isVerbatimExcerpt ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} />
                  )}
                  <span>
                    {isVerbatimExcerpt
                      ? captureSource === "pdf"
                        ? `Verified verbatim excerpt from page ${activePage}.`
                        : "Verified verbatim excerpt from the abstract."
                      : captureSource === "pdf"
                        ? `Not a verbatim match against page ${activePage}.`
                        : "Not a verbatim match against the abstract."}
                  </span>
                </div>
              )}

              {evidenceKind === "author passage" && (
                <p className="font-mono text-[9.5px] text-[var(--ink-muted)] leading-relaxed uppercase tracking-wider">
                  {captureSource === "pdf" && document
                    ? `Stored with document ${document.hash.slice(0, 8)}… and page ${activePage} — the quote is re-verified against that page forever.`
                    : "Author passages are stored verbatim and matched against the paper's abstract. Paraphrases belong to researcher notes."}
                </p>
              )}
            </div>

            {/* Capture message */}
            {captureMessage && (
              <div
                className={`flex items-start gap-2 border-2 rounded-[var(--radius-cut)] px-3 py-2.5 text-xs font-bold ${
                  captureMessage.type === "success"
                    ? "border-[var(--green)] bg-[var(--green-wash)] text-[var(--green-ink)]"
                    : captureMessage.type === "error"
                      ? "border-[var(--red)] bg-[var(--red-wash)] text-[var(--red-ink)]"
                      : "border-[var(--cyan)] bg-[var(--cyan-wash)] text-[var(--cyan-ink)]"
                }`}
                role="status"
              >
                {captureMessage.type === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.4} />
                ) : captureMessage.type === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.4} />
                ) : (
                  <Quote className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2.4} />
                )}
                <span className="leading-relaxed">{captureMessage.text}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              disabled={
                isCapturing ||
                !trimmedInput ||
                (evidenceKind === "author passage" && !isVerbatimExcerpt)
              }
              onClick={handleSaveEvidence}
              className="btn btn-primary w-full h-11 text-sm font-mono uppercase tracking-wider"
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={2.4} />
              <span>{isCapturing ? "Capturing…" : "Capture evidence"}</span>
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
