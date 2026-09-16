"use client";
import Link from "next/link";
import { useEffect, useState, CSSProperties } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionConfig,
} from "framer-motion";
import {
  Search,
  ArrowUpRight,
  ArrowRight,
  Star,
  ShieldCheck,
  Zap,
  Globe2,
  X,
  LayoutGrid,
  History,
  Plus,
  Sparkles,
  FileText,
  Check,
  Workflow,
  Trash2,
} from "lucide-react";
import { Shell } from "./shell";
import { ToolIcon } from "./icons";
import { useStudio } from "./store";
import { tools, categories, Tool } from "@/lib/pdf/tools";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatBytes } from "@/lib/pdf/types";
function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  const { favorites, toggleFavorite } = useStudio();
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [3, -3]), {
    stiffness: 220,
    damping: 24,
  });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-3, 3]), {
    stiffness: 220,
    damping: 24,
  });
  return (
    <motion.article
      className={"tool-card " + tool.color}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 11) * 0.025 }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <Link href={"/tools/" + tool.id} className="card-link">
        <div className="card-top">
          <span className="tool-icon">
            <ToolIcon name={tool.icon} />
          </span>
          {tool.badge && (
            <span
              className={
                "tool-badge " +
                (tool.badge === "New" || tool.badge === "AI"
                  ? "badge-special"
                  : "")
              }
            >
              {tool.badge}
            </span>
          )}
        </div>
        <h3>
          {tool.name}
          <ArrowUpRight className="card-arrow" size={16} />
        </h3>
        <p>{tool.description}</p>
        <span className="card-engine">
          {tool.engine === "service"
            ? "Service required"
            : tool.category === "Intelligence"
              ? "On-device intelligence"
              : "Works on your device"}
        </span>
      </Link>
      <button
        className={
          "favorite-btn " + (favorites.includes(tool.id) ? "is-favorite" : "")
        }
        onClick={() => toggleFavorite(tool.id)}
        aria-label={`${favorites.includes(tool.id) ? "Remove" : "Add"} ${tool.name} ${favorites.includes(tool.id) ? "from" : "to"} favorites`}
      >
        <Star
          size={15}
          fill={favorites.includes(tool.id) ? "currentColor" : "none"}
        />
      </button>
    </motion.article>
  );
}
export function Dashboard() {
  const [view, setView] = useState("All tools");
  const [query, setQuery] = useState("");
  const { favorites, history, clearHistory } = useStudio();
  const [workflowModal, setWorkflowModal] = useState(false);
  const [flow, setFlow] = useState<string[]>(["rotate-pdf", "page-numbers"]);
  const [flowName, setFlowName] = useState("My document finishing flow");
  const [savedFlows, setSavedFlows] = useState<
    { name: string; steps: string[] }[]
  >([]);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v) setView(v);
    try {
      setSavedFlows(
        JSON.parse(localStorage.getItem("studio-workflows") || "[]"),
      );
    } catch {}
  }, []);
  const filtered = tools.filter(
    (t) =>
      (view === "All tools" ||
        (view === "Favorites" && favorites.includes(t.id)) ||
        t.category === view) &&
      (!query ||
        (t.name + " " + t.description)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const navigate = (v: string) => {
    setView(v);
    setQuery("");
    window.history.replaceState(
      null,
      "",
      v === "All tools" ? "/" : "/?view=" + encodeURIComponent(v),
    );
  };
  const special = ["Recent activity", "Workflows"].includes(view);
  return (
    <MotionConfig reducedMotion="user">
      <Shell
        active={view}
        onNavigate={navigate}
        title={view === "All tools" ? "All PDF tools" : view}
      >
        <div className="dashboard">
          <section className="hero">
            <div className="hero-mesh" />
            <div className="hero-eyebrow">
              <span className="eyebrow-mark">
                <Sparkles size={12} />
              </span>{" "}
              YOUR EVERYDAY, UPGRADED <span className="eyebrow-line" />
            </div>
            <h1>
              A little less work.
              <br />A lot more{" "}
              <span className="flow-word">
                flow<span className="flow-period">.</span>
              </span>
            </h1>
            <p>
              Every PDF tool you need. One beautifully simple workspace.
              <br className="desktop-break" /> Make room for the work that
              matters.
            </p>
            <div className="hero-trust">
              <span>
                <ShieldCheck size={14} />
                Local file processing
              </span>
              <i />
              <span>
                <Zap size={14} />
                No signup needed
              </span>
              <i />
              <span>
                <Globe2 size={14} />
                Works in your browser
              </span>
            </div>
            <span className="hero-coordinate" aria-hidden="true">
              LESS FRICTION <span>↗</span> MORE POSSIBILITY
            </span>
          </section>
          {!special && (
            <>
              <div className="tools-heading">
                <div>
                  <h2>
                    {view === "Favorites"
                      ? "Your go-to tools"
                      : "Big tasks. Small clicks."}
                    <span>{filtered.length} tools</span>
                  </h2>
                  <p>
                    {view === "Favorites"
                      ? "A little collection of your most useful things."
                      : "Pick a tool. Add your files. Get on with your day."}
                  </p>
                </div>
                <div className="tool-search">
                  <Search size={17} />
                  <input
                    aria-label="Search PDF tools"
                    placeholder="Find your perfect tool..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query ? (
                    <button
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  ) : (
                    <kbd>⌘ K</kbd>
                  )}
                </div>
              </div>
              <Tabs
                value={view === "Favorites" ? "All tools" : view}
                onValueChange={navigate}
                className="category-tabs"
              >
                <TabsList variant="line">
                  {categories.map((c) => (
                    <TabsTrigger key={c} value={c}>
                      {c}
                      {c === "Intelligence" && <Sparkles size={13} />}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="tool-grid">
                {filtered.map((t, i) => (
                  <ToolCard key={t.id} tool={t} index={i} />
                ))}
              </div>
              {!filtered.length && (
                <div className="empty-state">
                  <Search size={32} />
                  <h3>
                    {view === "Favorites"
                      ? "Your favorites start here."
                      : "No tools found."}
                  </h3>
                  <p>
                    {view === "Favorites"
                      ? "Tap the star on any tool to keep it close."
                      : "Try a different search, or explore another category."}
                  </p>
                  <button
                    className="secondary-btn"
                    onClick={() => navigate("All tools")}
                  >
                    Explore all tools <ArrowRight size={16} />
                  </button>
                </div>
              )}
              {view === "All tools" && !query && (
                <div className="bottom-banner">
                  <span className="banner-icon">
                    <Workflow size={30} />
                  </span>
                  <div>
                    <span className="banner-eyebrow">
                      LESS REPEATING. MORE CREATING.
                    </span>
                    <h3>Your favorite tools. One smooth workflow.</h3>
                    <p>
                      Save a sequence of everyday edits and run them together.
                    </p>
                  </div>
                  <button
                    className="secondary-btn"
                    onClick={() => navigate("Workflows")}
                  >
                    Build your flow <ArrowUpRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
          {view === "Recent activity" && (
            <section className="activity-section">
              <div className="tools-heading">
                <div>
                  <h2>Your recent activity</h2>
                  <p>
                    Document names stay on this device. Files are never saved
                    here.
                  </p>
                </div>
                {history.length > 0 && (
                  <button className="secondary-btn" onClick={clearHistory}>
                    Clear activity
                  </button>
                )}
              </div>
              {!history.length ? (
                <div className="empty-state">
                  <History size={34} />
                  <h3>A fresh start.</h3>
                  <p>Your completed PDF tasks will appear here.</p>
                  <button
                    className="secondary-btn"
                    onClick={() => navigate("All tools")}
                  >
                    Find a tool <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                history.map((h) => (
                  <div className="activity-row" key={h.id}>
                    <span className="activity-file">
                      <FileText size={22} />
                    </span>
                    <div>
                      <strong>{h.name}</strong>
                      <span>
                        {tools.find((t) => t.id === h.tool)?.name || h.tool} ·{" "}
                        {formatBytes(h.size)}
                      </span>
                    </div>
                    <time>{new Date(h.date).toLocaleDateString()}</time>
                    <span className="completed-label">
                      <Check size={14} />
                      Completed
                    </span>
                  </div>
                ))
              )}
            </section>
          )}
          {view === "Workflows" && (
            <section>
              <div className="tools-heading">
                <div>
                  <h2>Meet your new routine.</h2>
                  <p>
                    Save a sequence of compatible edits. Run it on a PDF in one
                    step.
                  </p>
                </div>
                <button
                  className="primary-btn"
                  onClick={() => setWorkflowModal(true)}
                >
                  <Plus size={16} />
                  New workflow
                </button>
              </div>
              <div className="workflow-grid">
                {savedFlows.map((f, i) => (
                  <div className="workflow-card" key={i}>
                    <Workflow size={25} />
                    <h3>{f.name}</h3>
                    <p>
                      {f.steps
                        .map((s) => tools.find((t) => t.id === s)?.name)
                        .join(" → ")}
                    </p>
                    <div className="workflow-actions">
                      <Link
                        href={"/tools/workflow?steps=" + f.steps.join(",")}
                        className="secondary-btn"
                      >
                        Run workflow <ArrowRight size={15} />
                      </Link>
                      <button
                        className="icon-btn"
                        aria-label={"Delete " + f.name}
                        onClick={() => {
                          const next = savedFlows.filter((_, j) => j !== i);
                          setSavedFlows(next);
                          localStorage.setItem(
                            "studio-workflows",
                            JSON.stringify(next),
                          );
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {!savedFlows.length && (
                  <div className="empty-state">
                    <Workflow size={36} />
                    <h3>A few steps. One click.</h3>
                    <p>
                      Build your first workflow with rotation, page numbers, and
                      a watermark.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
        <Dialog open={workflowModal} onOpenChange={setWorkflowModal}>
          <DialogContent className="help-dialog">
            <DialogTitle>Build your flow</DialogTitle>
            <DialogDescription>
              These edits run in order on one PDF. Adjust their shared settings
              in the workspace.
            </DialogDescription>
            <label className="field-label">
              Workflow name
              <input
                className="field"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                maxLength={80}
              />
            </label>
            <div className="flow-options">
              {["rotate-pdf", "page-numbers", "watermark"].map((id) => (
                <button
                  className={
                    "option-button " + (flow.includes(id) ? "selected" : "")
                  }
                  key={id}
                  onClick={() =>
                    setFlow((v) =>
                      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
                    )
                  }
                >
                  {flow.includes(id) && <Check size={15} />}{" "}
                  {tools.find((t) => t.id === id)?.name}
                </button>
              ))}
            </div>
            <p className="muted">
              Order:{" "}
              {flow
                .map((s) => tools.find((t) => t.id === s)?.name)
                .join(" → ") || "Choose at least one tool"}
            </p>
            <button
              className="primary-btn"
              disabled={!flow.length || !flowName.trim()}
              onClick={() => {
                const next = [
                  ...savedFlows,
                  { name: flowName.trim(), steps: flow },
                ];
                setSavedFlows(next);
                localStorage.setItem("studio-workflows", JSON.stringify(next));
                setWorkflowModal(false);
              }}
            >
              Save workflow <ArrowRight size={16} />
            </button>
          </DialogContent>
        </Dialog>
      </Shell>
    </MotionConfig>
  );
}
