"use client";

import {
  Compass,
  Bookmark,
  FolderGit2,
  Scale,
  BookOpen,
  Bell,
  Download,
  Layers,
  Brain,
  Network,
  PenLine,
} from "lucide-react";
import type { StorageStatus } from "../desk/use-workspace";
import { ThemeToggle } from "../theme-toggle";

export type ActiveSection =
  | "discover"
  | "reading"
  | "saved"
  | "projects"
  | "compare"
  | "updates"
  | "review"
  | "graph"
  | "builder";

interface WorkspaceShellProps {
  currentSection: ActiveSection;
  onNavigate: (section: ActiveSection) => void;
  storageStatus: StorageStatus;
  savedCount: number;
  compareCount: number;
  unreadAlertsCount: number;
  dueReviewCount: number;
  unbackedClaimsCount: number;
  onExportSnapshot?: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: ActiveSection;
  index: string;
  label: string;
  short: string;
  icon: typeof Compass;
}[] = [
  { id: "discover", index: "01", label: "Discover", short: "Find", icon: Compass },
  { id: "reading", index: "02", label: "Reader", short: "Read", icon: BookOpen },
  { id: "saved", index: "03", label: "Library", short: "Saved", icon: Bookmark },
  { id: "projects", index: "04", label: "Projects", short: "Work", icon: FolderGit2 },
  { id: "compare", index: "05", label: "Compare", short: "Compare", icon: Scale },
  { id: "updates", index: "06", label: "Alerts", short: "Alerts", icon: Bell },
  { id: "review", index: "07", label: "Review", short: "Review", icon: Brain },
  { id: "graph", index: "08", label: "Citation map", short: "Map", icon: Network },
  { id: "builder", index: "09", label: "Argument builder", short: "Build", icon: PenLine },
];

function BrandMark({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 text-left group"
      aria-label="KIVO home — go to Discover"
    >
      {/* Stacked-sheets mark */}
      <span className="relative inline-flex h-11 w-11 items-center justify-center">
        <svg width="44" height="44" viewBox="0 0 64 64" fill="none" aria-hidden="true" className="transition-transform group-hover:-translate-y-0.5">
          <rect x="12" y="10" width="26" height="34" rx="1" fill="var(--bg-paper-dim)" stroke="var(--border-ink)" strokeWidth="2" />
          <rect x="19" y="17" width="26" height="34" rx="1" fill="var(--bg-paper)" stroke="var(--border-ink)" strokeWidth="2" />
          <rect x="26" y="24" width="26" height="34" rx="1" fill="var(--bg-paper)" stroke="var(--ink-heading)" strokeWidth="2.5" />
          <line x1="31" y1="31" x2="46" y2="31" stroke="var(--orange)" strokeWidth="2.5" />
          <line x1="31" y1="37" x2="43" y2="37" stroke="var(--cyan)" strokeWidth="2.5" />
          <line x1="31" y1="43" x2="46" y2="43" stroke="var(--yellow)" strokeWidth="2.5" />
          <circle cx="31" cy="52" r="2.5" fill="var(--cyan)" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[28px] font-extrabold tracking-tight text-[var(--ink-heading)]">
          KIVO
        </span>
        <span className="mt-1 font-mono text-[9.5px] font-bold tracking-[0.24em] uppercase text-[var(--cyan-ink)]">
          The Evidence Desk
        </span>
      </span>
    </button>
  );
}

export function WorkspaceShell({
  currentSection,
  onNavigate,
  storageStatus,
  savedCount,
  compareCount,
  unreadAlertsCount,
  dueReviewCount,
  unbackedClaimsCount,
  onExportSnapshot,
  children,
}: WorkspaceShellProps) {
  const badges: Partial<Record<ActiveSection, number>> = {
    saved: savedCount,
    compare: compareCount,
    updates: unreadAlertsCount,
    review: dueReviewCount,
    builder: unbackedClaimsCount,
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative z-10">
      {/* ============== DESKTOP SIDEBAR ============== */}
      <aside className="hidden lg:flex w-[272px] shrink-0 flex-col border-r-2 border-[var(--border-ink)] bg-[var(--bg-desk)]/90 backdrop-blur-md sticky top-0 h-screen">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <BrandMark onClick={() => onNavigate("discover")} />
        </div>

        <hr className="ledger-rule mx-5" />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5" aria-label="Workspace sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            const badge = badges[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`nav-entry ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="nav-index">{item.index}</span>
                <Icon className="h-[17px] w-[17px]" strokeWidth={2.1} />
                <span>{item.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="nav-count">{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar footer: storage status + backup + theme */}
        <div className="px-4 pb-5 space-y-3">
          <hr className="dot-rule" />
          <div className="flex items-center gap-2 px-1">
            <span className="live-dot" aria-hidden="true" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {storageStatus === "synced" ? "Workspace synced" : "Local engine"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onExportSnapshot && (
              <button
                type="button"
                onClick={onExportSnapshot}
                className="btn btn-ghost btn-chip flex-1 font-mono text-[10px] uppercase tracking-wider"
                title="Download a full JSON backup of your workspace"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup</span>
              </button>
            )}
            <ThemeToggle compact />
          </div>
          <p className="px-1 font-mono text-[9px] leading-relaxed text-[var(--ink-faint)] uppercase tracking-wider">
            Crossref · arXiv · Europe PMC
            <br />
            No keys · No accounts
          </p>
        </div>
      </aside>

      {/* ============== MOBILE TOP BAR ============== */}
      <header className="lg:hidden sticky top-0 z-40 border-b-2 border-[var(--border-ink)] bg-[var(--bg-desk)]/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <BrandMark onClick={() => onNavigate("discover")} />
          <div className="flex items-center gap-2">
            {onExportSnapshot && (
              <button
                type="button"
                onClick={onExportSnapshot}
                className="btn btn-ghost btn-chip !px-2"
                title="Backup workspace"
                aria-label="Backup workspace"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <ThemeToggle compact />
          </div>
        </div>
        {/* Scrollable section tabs */}
        <nav className="tab-strip px-3 pb-3" aria-label="Workspace sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            const badge = badges[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`tab-pill ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2.1} />
                <span>{item.short}</span>
                {badge !== undefined && badge > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-[2px] font-mono text-[9px] font-bold ${
                    isActive ? "bg-[var(--cyan)] text-[var(--on-cyan)]" : "bg-[var(--ink-heading)] text-[var(--on-ink)]"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ============== MAIN STAGE + FOOTER (column) ============== */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="w-full min-w-0 px-4 sm:px-6 lg:px-10 xl:px-14 py-8 sm:py-10">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>

        {/* ============== FOOTER (sticky bottom) ============== */}
        <footer className="mt-auto w-full border-t-2 border-[var(--border-ink)] bg-[var(--bg-desk)]/95 backdrop-blur-md">
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-10 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Layers className="w-3.5 h-3.5 text-[var(--cyan-ink)]" strokeWidth={2.2} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  KIVO — every claim traces to a line you can point at
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                <span className="flex items-center gap-1.5">
                  <span className="live-dot" aria-hidden="true" />
                  3 repositories online
                </span>
                <span>Solarized edition · v3.6</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
