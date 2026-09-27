"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircleQuestion,
  Loader2,
  ChevronDown,
  ShieldCheck,
  FileText,
  BookOpen,
  Copy,
  CornerDownRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { DocumentRecord } from "@/lib/workspace/schema";
import type { Paper } from "./paper-card";

interface AskPanelProps {
  paper: Paper;
  document: DocumentRecord | null;
  /** Jump the reader to a source: page 0 = abstract, page N = PDF page. */
  onGoToPage: (page: number) => void;
}

interface Quote {
  page: number;
  text: string;
}

interface AskEntry {
  id: string;
  question: string;
  status: "loading" | "done" | "error";
  answer: string | null;
  quotes: Quote[];
  droppedQuotes: number;
  reason?:
    | "no-relevant-passages"
    | "unsupported"
    | "model-unavailable"
    | "not-configured";
  cached?: boolean;
  errorText?: string;
}

const SUGGESTED = [
  "What is the main finding?",
  "What method does it use?",
  "What are the limitations?",
  "What data is it evaluated on?",
];

const ABSTAIN_TEXT: Record<NonNullable<AskEntry["reason"]>, string> = {
  "no-relevant-passages":
    "None of this paper's stored sources mention the terms in your question — there is nothing to ground an answer on. Try other wording, or upload the PDF so the full text can be searched.",
  unsupported:
    "The assistant could not support an answer with verified verbatim passages from the stored text — so it abstains rather than guess. This is the no-hallucination contract working as designed.",
  "model-unavailable":
    "The assistant is unreachable right now. Try again in a moment.",
  "not-configured":
    "No AI provider is configured on this desk, so grounded answers are switched off. Set LLM_API_KEY (plus optional LLM_BASE_URL / LLM_MODEL — any OpenAI-compatible endpoint works; see the README) to enable them. Every other tool keeps working without one.",
};

function sourceLabel(page: number): string {
  return page === 0 ? "Abstract" : `PDF · p.${page}`;
}

/**
 * "Ask the paper" — grounded Q&A over the paper's stored text.
 *
 * The panel sends only the paper's own sources (abstract + extracted PDF
 * pages) to /api/ask; the server verifies every returned quote as a verbatim
 * substring before the answer is allowed to render. Answers with zero
 * verified quotes never appear — the abstention does.
 */
export function AskPanel({ paper, document, onGoToPage }: AskPanelProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<AskEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sources = useMemo(() => {
    const list: Array<{ page: number; text: string }> = [];
    if (paper.abstract && paper.abstract.trim().length > 0) {
      list.push({ page: 0, text: paper.abstract });
    }
    if (document) {
      for (const p of document.pages) {
        if (p.text.trim().length > 0) list.push({ page: p.page, text: p.text });
        if (list.length >= 60) break; // server contract cap
      }
    }
    return list;
  }, [paper.abstract, document]);

  // Reset the thread when the paper changes underneath the reader.
  useEffect(() => {
    setEntries([]);
    setQuestion("");
  }, [paper.id]);

  const ask = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 5 || sources.length === 0) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setEntries((prev) => [
        { id, question: trimmed, status: "loading", answer: null, quotes: [], droppedQuotes: 0 },
        ...prev,
      ]);
      setQuestion("");

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, paperId: paper.id, passages: sources }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            typeof body?.error === "string" ? body.error : "The grounded assistant could not be reached.",
          );
        }
        const data = await res.json();
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "done",
                  answer: typeof data.answer === "string" ? data.answer : null,
                  quotes: Array.isArray(data.quotes) ? data.quotes : [],
                  droppedQuotes: typeof data.droppedQuotes === "number" ? data.droppedQuotes : 0,
                  reason: data.reason,
                  cached: data.cached === true,
                }
              : e,
          ),
        );
      } catch (err) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "error",
                  errorText:
                    err instanceof Error ? err.message : "The grounded assistant could not be reached.",
                }
              : e,
          ),
        );
      }
    },
    [paper.id, sources],
  );

  const copyAnswer = (entry: AskEntry) => {
    const lines = [`**Q:** ${entry.question}`, "", `**A:** ${entry.answer ?? ""}`, ""];
    for (const q of entry.quotes) {
      lines.push(`> “${q.text}” — ${sourceLabel(q.page)}`);
    }
    lines.push("", `— KIVO grounded Q&A on “${paper.title}”`);
    void navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.success("Answer copied as Markdown"))
      .catch(() => toast.error("Clipboard unavailable in this browser"));
  };

  return (
    <section className="bench-card p-5 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center gap-2.5 text-left group"
        aria-expanded={open}
      >
        <MessageCircleQuestion className="w-4 h-4 text-[var(--magenta-ink)] shrink-0" strokeWidth={2.2} />
        <h2 className="stamp-label">
          <span className="stamp-underline">Ask the paper</span>
        </h2>
        <span className="h-0.5 flex-1 bg-[var(--border-soft)] min-w-[30px]" />
        <span className="ticket ticket-magenta !py-0.5">
          <ShieldCheck className="w-3 h-3" strokeWidth={2.4} />
          <span>Grounded · no guessing</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {open && (
        <div className="space-y-4 animate-rise">
          <p className="font-mono text-[9.5px] text-[var(--ink-muted)] uppercase tracking-wider leading-relaxed">
            Answers are assembled only from this paper&apos;s stored sources
            (abstract{document ? " + extracted PDF pages" : ""}) — every quote is
            re-verified verbatim on the server. No verified passage, no answer.
          </p>

          {sources.length === 0 ? (
            <div className="hatch border-2 border-dashed border-[var(--border-soft)] rounded-[var(--radius-cut)] p-6 text-center text-xs text-[var(--ink-muted)] font-mono uppercase tracking-wider">
              This record has no stored text to ask about — upload the PDF above first.
            </div>
          ) : (
            <>
              {/* Question input */}
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(question);
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask something the paper itself should answer…"
                  className="field-input flex-1"
                  maxLength={500}
                  aria-label="Your question about this paper"
                />
                <button
                  type="submit"
                  disabled={question.trim().length < 5}
                  className="btn btn-primary h-10 px-5 text-[11px] font-mono uppercase tracking-wider"
                >
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2.4} />
                  <span>Ask</span>
                </button>
              </form>

              {/* Suggested questions */}
              <div className="flex flex-wrap items-center gap-1.5">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQuestion(s);
                      inputRef.current?.focus();
                    }}
                    className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Thread */}
              <div ref={listRef} className="bench-scroll space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                {entries.length === 0 && (
                  <div className="border-2 border-dotted border-[var(--border-soft)] rounded-[var(--radius-cut)] px-4 py-5 text-center">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] leading-relaxed">
                      Ask a question — the answer arrives with clickable verbatim receipts.
                    </p>
                  </div>
                )}

                {entries.map((entry) => (
                  <article key={entry.id} className="paper-slip p-4 space-y-3 animate-rise">
                    <div className="flex items-start gap-2">
                      <CornerDownRight className="w-3.5 h-3.5 mt-1 shrink-0 text-[var(--magenta-ink)]" strokeWidth={2.4} />
                      <p className="text-[13.5px] font-bold text-[var(--ink-heading)] leading-snug">
                        {entry.question}
                      </p>
                    </div>

                    {entry.status === "loading" && (
                      <div className="flex items-center gap-2.5 px-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--magenta-ink)]" strokeWidth={2.4} />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                          Retrieving passages · asking · verifying quotes…
                        </span>
                      </div>
                    )}

                    {entry.status === "error" && (
                      <p className="text-xs font-bold text-[var(--red-ink)] leading-relaxed border-l-4 border-[var(--red)] pl-3">
                        {entry.errorText}
                      </p>
                    )}

                    {entry.status === "done" && entry.answer && (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="ticket ticket-green !py-0.5">
                            <ShieldCheck className="w-3 h-3" strokeWidth={2.4} />
                            <span>Grounded · {entry.quotes.length} verified</span>
                          </span>
                          {entry.droppedQuotes > 0 && (
                            <span
                              className="ticket ticket-yellow !py-0.5"
                              title="Model quotes that failed the verbatim check and were removed"
                            >
                              <span>{entry.droppedQuotes} dropped</span>
                            </span>
                          )}
                          {entry.cached && (
                            <span className="ticket ticket-violet !py-0.5">
                              <span>cached</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] text-[var(--ink-body)] leading-[1.75]">
                          {entry.answer}
                        </p>
                        <div className="space-y-2">
                          {entry.quotes.map((q, i) => (
                            <button
                              key={`${entry.id}-${i}`}
                              type="button"
                              onClick={() => onGoToPage(q.page)}
                              className="ask-receipt w-full text-left group/receipt border-l-4 border-[var(--green)] bg-[var(--green-wash)] px-3 py-2 space-y-1 hover:border-[var(--magenta)]"
                              title="Show this passage in its source"
                            >
                              <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--green-ink)]">
                                {q.page === 0 ? (
                                  <BookOpen className="w-3 h-3" strokeWidth={2.4} />
                                ) : (
                                  <FileText className="w-3 h-3" strokeWidth={2.4} />
                                )}
                                <span>{sourceLabel(q.page)} · verbatim receipt</span>
                              </span>
                              <span className="block text-[12.5px] italic leading-relaxed text-[var(--ink-body)]">
                                “{q.text.length > 320 ? `${q.text.slice(0, 320)}…` : q.text}”
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center justify-end pt-0.5">
                          <button
                            type="button"
                            onClick={() => copyAnswer(entry)}
                            className="btn btn-ghost btn-chip text-[9.5px] font-mono uppercase tracking-wider"
                          >
                            <Copy className="w-3 h-3" strokeWidth={2.4} />
                            <span>Copy as Markdown</span>
                          </button>
                        </div>
                      </>
                    )}

                    {entry.status === "done" && !entry.answer && (
                      <div className="flex items-start gap-2.5 border-2 border-[var(--yellow)] bg-[var(--yellow-wash)] rounded-[var(--radius-cut)] px-3.5 py-3">
                        <span className="stamp-label !text-[var(--yellow-ink)] shrink-0">
                          <span className="stamp-underline">Abstains</span>
                        </span>
                        <p className="text-xs font-bold text-[var(--yellow-ink)] leading-relaxed">
                          {entry.reason ? ABSTAIN_TEXT[entry.reason] : ABSTAIN_TEXT.unsupported}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
