"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, ReactNode, CSSProperties } from "react";
import {
  FileText,
  Search,
  Star,
  History,
  Workflow,
  ArrowUpRight,
  Sun,
  Moon,
  ShieldCheck,
  ChevronRight,
  Command as CommandIcon,
  HelpCircle,
  Heart,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudio } from "./store";
import { tools, categories } from "@/lib/pdf/tools";
import { ToolIcon, categoryIcons } from "./icons";
export function Shell({
  children,
  active = "All tools",
  onNavigate,
  title = "Your workspace",
}: {
  children: ReactNode;
  active?: string;
  onNavigate?: (v: string) => void;
  title?: string;
}) {
  const router = useRouter();
  const { theme, toggleTheme, favorites } = useStudio();
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  function nav(v: string) {
    if (onNavigate) onNavigate(v);
    else router.push("/?view=" + encodeURIComponent(v));
  }
  return (
    <SidebarProvider style={{ "--sidebar-width": "232px" } as CSSProperties}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar className="studio-sidebar">
        <SidebarHeader className="brand-wrap">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <FileText size={23} />
            </span>
            <span>
              pdf<span className="brand-light">studio</span>
              <span className="brand-dot">.</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="side-content">
          <button className="sidebar-search" onClick={() => setSearch(true)}>
            <Search size={16} />
            <span>Quick search</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="nav-caption">WORKSPACE</div>
          <nav aria-label="Workspace">
            <button
              className={"nav-item " + (active === "All tools" ? "active" : "")}
              onClick={() => nav("All tools")}
            >
              <span className="nav-icon">
                {(() => {
                  const I = categoryIcons["All tools"];
                  return <I size={18} />;
                })()}
              </span>
              All tools<span className="nav-count">{tools.length}</span>
            </button>
            {[
              { v: "Favorites", I: Star, n: favorites.length },
              { v: "Recent activity", I: History },
              { v: "Workflows", I: Workflow },
            ].map(({ v, I, n }) => (
              <button
                key={v}
                className={"nav-item " + (active === v ? "active" : "")}
                onClick={() => nav(v)}
              >
                <I size={18} />
                {v}
                {n !== undefined && n > 0 && (
                  <span className="nav-count">{n}</span>
                )}
                {v === "Workflows" && <span className="tiny-badge">BETA</span>}
              </button>
            ))}
          </nav>
          <div className="nav-caption category-caption">PDF TOOLKIT</div>
          <nav aria-label="Tool categories">
            {categories.slice(1).map((c) => {
              const I = categoryIcons[c];
              return (
                <button
                  key={c}
                  className={"nav-item " + (active === c ? "active" : "")}
                  onClick={() => nav(c)}
                >
                  <I size={18} />
                  {c} PDF{c === "Intelligence" && <span className="new-dot" />}
                </button>
              );
            })}
          </nav>
          <div className="local-card">
            <div className="local-symbol">
              <ShieldCheck size={21} />
            </div>
            <strong>Your files. Your space.</strong>
            <p>Core tools process documents right on your device.</p>
            <button onClick={() => setHelp(true)}>
              A little peace of mind <ArrowUpRight size={14} />
            </button>
          </div>
        </SidebarContent>
        <SidebarFooter className="side-footer">
          <button className="nav-item" onClick={() => setHelp(true)}>
            <HelpCircle size={18} />
            Help & shortcuts
          </button>
          <div className="device-profile">
            <span className="device-avatar">Y</span>
            <div>
              <strong>Your personal space</strong>
              <span>Made for your flow</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="site-main">
        <header className="topbar">
          <div className="topbar-location">
            <SidebarTrigger className="mobile-trigger" />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-note">
              <ShieldCheck size={14} /> Private by design
            </span>
            <span className="header-divider" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="icon-btn"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </TooltipTrigger>
              <TooltipContent>Switch appearance</TooltipContent>
            </Tooltip>
            <button
              className="top-search icon-btn"
              onClick={() => setSearch(true)}
              aria-label="Search tools"
            >
              <Search size={18} />
            </button>
            <span className="top-avatar">Y</span>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="page-footer">
          <span>Less friction. More flow.</span>
          <span>
            Crafted with <Heart size={12} /> for your everyday.
          </span>
          <span>
            PDF Studio <span className="footer-version">/ 01</span>
          </span>
        </footer>
      </div>
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent className="search-dialog" showCloseButton={false}>
          <DialogTitle className="sr-only">Find your PDF tool</DialogTitle>
          <DialogDescription className="sr-only">
            Search all PDF tools. Use arrow keys to navigate and Enter to open.
          </DialogDescription>
          <Command>
            <CommandInput placeholder="What would you like to do?" />
            <CommandList>
              <CommandEmpty>
                No tools found. Try “merge” or “convert”.
              </CommandEmpty>
              <CommandGroup heading="PDF tools">
                {tools.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.name + " " + t.description}
                    onSelect={() => {
                      setSearch(false);
                      router.push("/tools/" + t.id);
                    }}
                  >
                    <span className={"command-tool " + t.color}>
                      <ToolIcon name={t.icon} size={20} />
                    </span>
                    <span>{t.name}</span>
                    <span className="command-category">{t.category}</span>
                    <ArrowUpRight size={14} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="command-footer">
              <span>↑ ↓ to navigate</span>
              <span>↵ to open</span>
              <kbd>esc</kbd>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>A workspace that respects your files.</DialogTitle>
          <DialogDescription>
            Core tools work in your browser. PDF documents are not stored in
            your activity history.
          </DialogDescription>
          <div className="help-body">
            <p>
              Tools marked “Service required” need a separately configured
              processing service. They are unavailable until connected; files
              are never silently sent to a third party.
            </p>
            <p>
              OCR downloads an English recognition model on first use.
              Conversion quality depends on the document. Each tool shows its
              specific limitations before you begin.
            </p>
            <div className="shortcut-row">
              <span>Find any tool</span>
              <kbd>Ctrl / ⌘ + K</kbd>
            </div>
            <div className="shortcut-row">
              <span>Toggle sidebar</span>
              <kbd>Ctrl / ⌘ + B</kbd>
            </div>
            <p className="muted">
              Independent PDF Studio project. Not affiliated with iLovePDF.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
