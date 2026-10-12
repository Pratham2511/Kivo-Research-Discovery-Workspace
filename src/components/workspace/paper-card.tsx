"use client";

import { useState } from "react";
import { FileText, Bookmark, Scale, ExternalLink, ChevronDown, ChevronUp, FolderPlus, BookOpen, AlertTriangle } from "lucide-react";
import type { Repro, Workspace } from "@/lib/workspace/schema";
import { resolvePaperAccess } from "./source-resolver";

export type Paper = Workspace["papers"][number];
export type { Evidence } from "@/lib/workspace/schema";

interface PaperCardProps {
  paper: Paper;
  isSaved: boolean;
  isCompared: boolean;
  onToggleSave: (paper: Paper) => void;
  onToggleCompare: (paper: Paper) => void;
  onOpenReader: (paper: Paper) => void;
  onAddToProject?: (paper: Paper) => void;
  repro?: Repro;
}

export function PaperCard({ paper, isSaved, isCompared, onToggleSave, onToggleCompare, onOpenReader, onAddToProject, repro }: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const access = resolvePaperAccess(paper);
  const authors = paper.authors.length ? paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "") : "Authors not listed";
  const reproChecks = repro ? [repro.code, repro.data, repro.seeds] : [];
  const reproSet = reproChecks.some(value => value !== null) || !!repro?.license;

  return (
    <article className={"paper-slip research-paper " + (isSaved ? "is-saved" : "")}>
      <div className="paper-meta">
        <span>{paper.year ?? "Year unavailable"}</span>
        {paper.venue && <span className="paper-venue" title={paper.venue}>{paper.venue}</span>}
        <span className="paper-source">{paper.sources.join(" · ")}</span>
        {paper.citationCount !== null && <span>{paper.citationCount} citations</span>}
        <span className="paper-access">{access.hasDirectPdf ? "PDF available" : paper.openAccess ? "Open access" : "Source record"}</span>
      </div>
      <h3><button type="button" onClick={() => onOpenReader(paper)}>{paper.title}</button></h3>
      <p className="paper-authors">{authors}</p>
      {!!paper.integrityNotices?.length && <p className="paper-integrity"><AlertTriangle size={15} /> This record has a correction or retraction notice. Check the source.</p>}
      {paper.abstract ? <div className="paper-abstract">
        <p className={expanded ? "" : "line-clamp-3"}>{paper.abstract}</p>
        {paper.abstract.length > 280 && <button type="button" className="text-action" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Less" : "Read abstract"} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>}
      </div> : <p className="paper-no-abstract">No abstract supplied. Open the source for more detail.</p>}
      <div className="paper-actions">
        <div>
          <button type="button" className="btn btn-accent-orange" onClick={() => onOpenReader(paper)}><BookOpen size={15} /> Open reader</button>
          {access.primaryAction && <a href={access.primaryAction.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            {access.hasDirectPdf ? <FileText size={15} /> : <ExternalLink size={15} />}
            {access.hasDirectPdf ? "View PDF" : "View source"}
          </a>}
        </div>
        <div>
          {onAddToProject && <button type="button" className="btn btn-ghost" onClick={() => onAddToProject(paper)} aria-label="Add to project" title="Add to your current screening project"><FolderPlus size={15} /><span className="paper-project-label">Project</span></button>}
          <button type="button" className={"btn " + (isCompared ? "btn-accent-orange" : "btn-ghost")} onClick={() => onToggleCompare(paper)} aria-pressed={isCompared}>
            <Scale size={15} /><span>{isCompared ? "Comparing" : "Compare"}</span>
          </button>
          <button type="button" className={"btn " + (isSaved ? "btn-accent-orange" : "btn-ghost")} onClick={() => onToggleSave(paper)} aria-pressed={isSaved}>
            <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} /><span>{isSaved ? "Saved" : "Save"}</span>
          </button>
        </div>
      </div>
      {reproSet && <p className="paper-repro">Reproducibility checked: {reproChecks.filter(value => value === true).length}/3{repro?.license ? " · " + repro.license : ""}</p>}
    </article>
  );
}
