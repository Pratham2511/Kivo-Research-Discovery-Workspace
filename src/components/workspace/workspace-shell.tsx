"use client";

import { Compass, Bookmark, FolderGit2, Scale, BookOpen, Bell, Download, Brain, Network, PenLine, ArrowUpRight, AlertCircle, Settings2 } from "lucide-react";
import Link from "next/link";
import type { StorageStatus } from "../desk/use-workspace";
import { ThemeToggle } from "../theme-toggle";
import { KivoLogo } from "../kivo-logo";

export type ActiveSection = "discover" | "reading" | "saved" | "projects" | "compare" | "updates" | "review" | "graph" | "builder" | "settings";
interface WorkspaceShellProps {
  currentSection: ActiveSection;
  onNavigate: (section: ActiveSection) => void;
  storageStatus: StorageStatus;
  storageError?: string;
  savedCount: number;
  compareCount: number;
  unreadAlertsCount: number;
  dueReviewCount: number;
  unbackedClaimsCount: number;
  onExportSnapshot?: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: ActiveSection; label: string; short: string; icon: typeof Compass; group: string }[] = [
  { id: "discover", label: "Discover", short: "Search", icon: Compass, group: "Find & read" },
  { id: "reading", label: "Reader", short: "Reader", icon: BookOpen, group: "Find & read" },
  { id: "saved", label: "Library", short: "Library", icon: Bookmark, group: "Find & read" },
  { id: "projects", label: "Projects", short: "Projects", icon: FolderGit2, group: "Organize" },
  { id: "compare", label: "Compare", short: "Compare", icon: Scale, group: "Organize" },
  { id: "graph", label: "Citation map", short: "Map", icon: Network, group: "Organize" },
  { id: "builder", label: "Argument builder", short: "Build", icon: PenLine, group: "Develop your review" },
  { id: "review", label: "Review", short: "Review", icon: Brain, group: "Develop your review" },
  { id: "updates", label: "Alerts", short: "Alerts", icon: Bell, group: "Develop your review" },
  { id: "settings", label: "Settings", short: "Settings", icon: Settings2, group: "Develop your review" },
];

export function WorkspaceShell(props: WorkspaceShellProps) {
  const { currentSection, onNavigate, storageStatus, storageError, onExportSnapshot, children } = props;
  const badges: Partial<Record<ActiveSection, number>> = {
    saved: props.savedCount, compare: props.compareCount, updates: props.unreadAlertsCount,
    review: props.dueReviewCount, builder: props.unbackedClaimsCount,
  };
  function navigate(section: ActiveSection) {
    onNavigate(section);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function navButton(item: typeof NAV_ITEMS[number], mobile = false) {
    const active = currentSection === item.id;
    const Icon = item.icon;
    const badge = badges[item.id];
    return <button key={item.id} type="button" onClick={() => navigate(item.id)}
      className={(mobile ? "tab-pill" : "nav-entry") + (active ? " is-active" : "")} aria-current={active ? "page" : undefined}>
      <Icon size={18} strokeWidth={1.8} /><span>{mobile ? item.short : item.label}</span>
      {!!badge && <span className="nav-count">{badge}</span>}
    </button>;
  }
  const name = NAV_ITEMS.find(item => item.id === currentSection)?.label ?? "Discover";

  return (
    <div className="workspace-frame">
      <a href="#workspace-main" className="skip-link">Skip to workspace</a>
      <aside className="workspace-sidebar">
        <button type="button" className="workspace-brand" onClick={() => navigate("discover")} aria-label="Kivo home, go to Discover">
          <KivoLogo /><span>Research workspace</span>
        </button>
        <nav aria-label="Workspace sections">
          {["Find & read", "Organize", "Develop your review"].map(group => <div className="nav-group" key={group}>
            <p>{group}</p>{NAV_ITEMS.filter(item => item.group === group).map(item => navButton(item))}
          </div>)}
        </nav>
        <div className="workspace-sidebar-bottom">
          <p className={"storage-label " + (storageStatus === "memory" ? "is-warning" : "")}>
            {storageStatus === "memory" ? "Changes only in this tab" : "Saved in this browser"}
          </p>
          {onExportSnapshot && <button type="button" className="btn btn-ghost" onClick={onExportSnapshot} title="Download your complete research workspace"><Download size={16} /> Download backup</button>}
          <Link href="/" className="sidebar-home">About Kivo <ArrowUpRight size={14} /></Link>
        </div>
      </aside>
      <div className="workspace-stage">
        <header className="workspace-topbar">
          <button type="button" className="mobile-brand" onClick={() => navigate("discover")} aria-label="Kivo home, go to Discover"><KivoLogo /></button>
          <div className="workspace-breadcrumb">Workspace <span>/</span> <strong>{name}</strong></div>
          <div className="workspace-top-actions">
            {onExportSnapshot && <button type="button" className="btn btn-ghost mobile-backup" onClick={onExportSnapshot} aria-label="Download workspace backup"><Download size={16} /></button>}
            <ThemeToggle compact />
          </div>
        </header>
        <nav className="workspace-mobile-nav tab-strip" aria-label="Workspace sections">{NAV_ITEMS.map(item => navButton(item, true))}</nav>
        <main id="workspace-main" className="workspace-main" tabIndex={-1}>
          {storageError && <div className="storage-warning" role="alert"><AlertCircle size={19} /><p>{storageError}</p>
            {onExportSnapshot && <button type="button" className="btn btn-primary" onClick={onExportSnapshot}>Download backup</button>}</div>}
          {children}
        </main>
        <footer className="workspace-footer"><span>Keep the source with the thought.</span><span>Local workspace · No account required</span></footer>
      </div>
    </div>
  );
}
