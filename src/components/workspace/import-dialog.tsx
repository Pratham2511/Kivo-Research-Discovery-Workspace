"use client";

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  FileUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Paper } from "./paper-card";
import {
  parseReferenceImport,
  type ImportResult,
} from "@/lib/workspace/bib-import";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPaperIds: Set<string>;
  existingDois: Set<string>;
  onImport: (papers: Paper[]) => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  existingPaperIds,
  existingDois,
  onImport,
}: ImportDialogProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setText("");
    setResult(null);
    setFileName(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const runParse = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setResult(null);
      return;
    }
    setResult(parseReferenceImport(value));
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const content = await file.text();
    runParse(content);
  };

  // Split parsed papers into new vs already-known (by id or DOI).
  const newPapers = (result?.papers || []).filter(
    (p) => !existingPaperIds.has(p.id) && !(p.doi && existingDois.has(p.doi))
  );
  const knownCount = (result?.papers.length || 0) - newPapers.length;

  const handleImport = () => {
    if (newPapers.length === 0) return;
    onImport(newPapers);
    reset();
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!max-w-xl !bg-[var(--bg-paper)] !border-2 !border-[var(--border-ink)] !rounded-[var(--radius-cut)] !shadow-[6px_6px_0_rgba(101,123,131,0.25)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="!font-display !text-xl font-extrabold !text-[var(--ink-heading)] flex items-center gap-2.5">
            <Upload className="w-5 h-5 text-[var(--cyan-ink)]" strokeWidth={2.2} />
            Import references
          </DialogTitle>
          <DialogDescription className="!text-[var(--ink-body)] text-sm">
            Paste BibTeX or RIS from Zotero, Mendeley, or JabRef — or drop a{" "}
            <span className="font-mono">.bib</span> / <span className="font-mono">.ris</span>{" "}
            file below. Imported records match against your library by DOI, so
            duplicates are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Drop zone / file picker */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full hatch border-2 border-dashed border-[var(--border-ink)] rounded-[var(--radius-cut)] py-6 px-4 text-center transition-colors hover:border-[var(--cyan)] hover:bg-[var(--cyan-wash)]"
            aria-label="Choose a .bib or .ris file"
          >
            <FileUp className="w-5 h-5 mx-auto text-[var(--cyan-ink)]" strokeWidth={2.2} />
            <span className="mt-2 block text-sm font-bold text-[var(--ink-heading)]">
              {fileName ? `Loaded: ${fileName}` : "Choose a .bib / .ris / .txt file"}
            </span>
            <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)]">
              Or paste the text directly below
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".bib,.ris,.txt,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />

          {/* Paste area */}
          <div className="space-y-1.5">
            <label
              htmlFor="import-textarea"
              className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] block"
            >
              Reference text
            </label>
            <textarea
              id="import-textarea"
              rows={7}
              value={text}
              onChange={(e) => runParse(e.target.value)}
              placeholder={`@article{smith2020,\n  title = {Attention is all you need},\n  author = {Smith, Jane and Doe, John},\n  year = {2020},\n  journal = {Journal of Important Results},\n  doi = {10.1000/example},\n}`}
              className="field-input !font-mono !text-[12px] !leading-relaxed resize-y"
            />
          </div>

          {/* Parse outcome */}
          {result && (
            <div className="space-y-3">
              {result.papers.length > 0 ? (
                <div
                  className="flex items-start gap-2 border-2 border-[var(--green)] bg-[var(--green-wash)] text-[var(--green-ink)] rounded-[var(--radius-cut)] px-3 py-2.5 text-xs font-bold"
                  role="status"
                >
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2.4} />
                  <span>
                    Parsed {result.papers.length}{" "}
                    {result.papers.length === 1 ? "record" : "records"} ·{" "}
                    {newPapers.length} new · {knownCount} already in your library
                    {result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}
                  </span>
                </div>
              ) : (
                <div
                  className="flex items-start gap-2 border-2 border-[var(--red)] bg-[var(--red-wash)] text-[var(--red-ink)] rounded-[var(--radius-cut)] px-3 py-2.5 text-xs font-bold"
                  role="alert"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2.4} />
                  <span>{result.errors[0] || "Could not parse any records."}</span>
                </div>
              )}

              {/* Preview */}
              {newPapers.length > 0 && (
                <div className="bench-card !shadow-none !p-0 overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <table className="bench-table">
                      <thead>
                        <tr>
                          <th className="text-left">Title</th>
                          <th className="text-left">Authors</th>
                          <th className="text-center">Year</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newPapers.slice(0, 25).map((p) => (
                          <tr key={p.id}>
                            <td className="text-left">
                              <span className="flex items-center gap-1.5">
                                <FileText className="w-3 h-3 shrink-0 text-[var(--ink-faint)]" strokeWidth={2.2} />
                                <span className="line-clamp-1 font-bold text-[var(--ink-heading)] max-w-[260px]">
                                  {p.title}
                                </span>
                              </span>
                            </td>
                            <td className="text-left italic text-[12px] max-w-[160px] truncate">
                              {p.authors[0] || "Unknown"}
                              {p.authors.length > 1 ? " et al." : ""}
                            </td>
                            <td className="text-center font-mono text-[12px] font-bold">
                              {p.year ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {newPapers.length > 25 && (
                    <p className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-muted)] px-3 py-2 border-t-2 border-dotted border-[var(--border-soft)]">
                      + {newPapers.length - 25} more records
                    </p>
                  )}
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 1 && (
                <details className="font-mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">
                  <summary className="cursor-pointer hover:text-[var(--ink-heading)]">
                    {result.errors.length - (result.papers.length ? 0 : 1)} parse notes
                  </summary>
                  <ul className="mt-1.5 space-y-1 normal-case tracking-normal">
                    {result.errors.slice(result.papers.length ? 0 : 1).map((e, i) => (
                      <li key={i}>· {e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="btn btn-ghost btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={newPapers.length === 0}
              className="btn btn-primary btn-chip text-[11px] font-mono uppercase tracking-wider"
            >
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
              <span>
                Import {newPapers.length} {newPapers.length === 1 ? "record" : "records"}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
