"use client";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, Reorder, AnimatePresence, MotionConfig } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileUp,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Check,
  Download,
  RotateCw,
  ShieldCheck,
  Info,
  SlidersHorizontal,
  Loader2,
  Camera,
  FileText,
  AlertCircle,
  Plug,
  ChevronLeft,
  ChevronRight,
  CopyCheck,
} from "lucide-react";
import { Shell } from "./shell";
import { ToolIcon } from "./icons";
import { Controls, Pick } from "./controls";
import { getTool, Tool } from "@/lib/pdf/tools";
import {
  PDFOptions,
  defaultOptions,
  formatBytes,
  Output,
} from "@/lib/pdf/types";
import {
  runWorker,
  thumbnail,
  openPDF,
  renderPage,
  renderTool,
} from "@/lib/pdf/client";
import { useStudio } from "./store";
import { getCapabilities } from "@/app/actions/capabilities";
import { Skeleton } from "@/components/ui/skeleton";
type QueueFile = { id: string; file: File; url?: string; count: number };
type PageItem = { index: number; rotation: number; url: string };
const workflowTool: Tool = {
  id: "workflow",
  name: "Your PDF workflow",
  description: "A few thoughtful edits. One smooth finish.",
  category: "Edit",
  icon: "organize",
  color: "purple",
  engine: "local",
  accept: ".pdf",
};
export function Workspace({ toolId }: { toolId: string }) {
  const tool = getTool(toolId) || workflowTool;
  const { addHistory } = useStudio();
  const [files, setFiles] = useState<QueueFile[]>([]);
  const [options, setOptions] = useState<PDFOptions>({
    ...defaultOptions,
    fontSize: toolId === "page-numbers" ? 12 : 24,
    position: ["page-numbers", "sign-pdf"].includes(toolId)
      ? "bottom-center"
      : "center",
    rotation: toolId === "watermark" ? 45 : 90,
  });
  const [status, setStatus] = useState<"idle" | "processing" | "ready">("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Reading your files");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<(Output & { url: string }) | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [formFields, setFormFields] = useState<
    { name: string; type: string; value: string | boolean }[]
  >([]);
  const [serviceReady, setServiceReady] = useState(false);
  const [comparePage, setComparePage] = useState(1);
  const [compare, setCompare] = useState<{
    a: string;
    b: string;
    diff: string;
    label: string;
    count: number;
  } | null>(null);
  const [compareView, setCompareView] = useState("side");
  const input = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const readLock = useRef(false);
  const activeFiles = useRef(files);
  activeFiles.current = files;
  const resultRef = useRef(result);
  resultRef.current = result;
  const compareRef = useRef(compare);
  compareRef.current = compare;
  const pageDrag = useRef<number | null>(null);
  const set = (p: Partial<PDFOptions>) => {
    setOptions((v) => ({ ...v, ...p }));
    setError("");
  };
  useEffect(() => {
    getCapabilities()
      .then((c) =>
        setServiceReady(
          c.tools.find((t) => t.id === toolId)?.available || false,
        ),
      )
      .catch(() => {});
    if (toolId === "workflow") {
      const steps = (new URLSearchParams(location.search).get("steps") || "")
        .split(",")
        .filter(Boolean);
      setOptions((v) => ({ ...v, steps }));
    }
    return () => {
      controller.current?.abort();
      activeFiles.current.forEach((f) => {
        if (f.url?.startsWith("blob:")) URL.revokeObjectURL(f.url);
      });
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
      if (compareRef.current) URL.revokeObjectURL(compareRef.current.diff);
    };
  }, [toolId]);
  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (readLock.current || status === "processing") return;
      readLock.current = true;
      setReading(true);
      setError("");
      try {
        const accepts = tool.accept.split(",");
        const supported = incoming.filter((f) =>
          accepts.some((ext) => f.name.toLowerCase().endsWith(ext)),
        );
        if (supported.length !== incoming.length)
          throw Error(
            `Choose ${tool.accept.replaceAll(",", " or ")} files for this tool.`,
          );
        if (!supported.length) return;
        const existing = activeFiles.current;
        const candidates = tool.multiple
          ? [...existing.map((f) => f.file), ...supported]
          : [supported[0]];
        const unique = candidates.filter(
          (f, i, a) =>
            a.findIndex(
              (x) =>
                x.name === f.name &&
                x.size === f.size &&
                x.lastModified === f.lastModified,
            ) === i,
        );
        if (unique.length > 50) throw Error("Add up to 50 files at a time.");
        if (unique.reduce((n, f) => n + f.size, 0) > 25 * 1024 * 1024)
          throw Error("Keep the combined file size under 25 MB.");
        if (toolId === "compare-pdf" && unique.length > 2)
          throw Error("Choose exactly two PDFs to compare.");
        const next: QueueFile[] = [];
        for (let i = 0; i < unique.length; i++) {
          const f = unique[i];
          const old = existing.find((x) => x.file === f);
          if (old) {
            next.push(old);
            continue;
          }
          setProgress(Math.round((i / unique.length) * 100));
          let preview: { url?: string; count: number } = { count: 0 };
          if (tool.engine !== "service") preview = await thumbnail(f);
          next.push({ id: crypto.randomUUID(), file: f, ...preview });
        }
        existing
          .filter((f) => !next.some((n) => n.id === f.id))
          .forEach((f) => {
            if (f.url?.startsWith("blob:")) URL.revokeObjectURL(f.url);
          });
        setFiles(next);
        setPages([]);
        setFormFields([]);
        setOptions((v) => ({ ...v, pageOrder: undefined, fields: undefined }));
        if (compareRef.current) URL.revokeObjectURL(compareRef.current.diff);
        setCompare(null);
        setComparePage(1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to read this file.");
      } finally {
        setReading(false);
        readLock.current = false;
        if (input.current) input.current.value = "";
      }
    },
    [tool, toolId, status],
  );
  useEffect(() => {
    const first = files[0];
    if (
      !first ||
      !["organize-pdf", "crop-pdf", "redact-pdf", "pdf-forms"].includes(toolId)
    )
      return;
    let cancelled = false;
    setLoadingPages(true);
    (async () => {
      try {
        if (toolId === "pdf-forms") {
          const { PDFDocument, PDFTextField, PDFCheckBox } =
            await import("pdf-lib");
          const doc = await PDFDocument.load(await first.file.arrayBuffer());
          const fields = doc
            .getForm()
            .getFields()
            .filter(
              (f) => f instanceof PDFTextField || f instanceof PDFCheckBox,
            )
            .map((f) => ({
              name: f.getName(),
              type: f instanceof PDFCheckBox ? "checkbox" : "text",
              value:
                f instanceof PDFCheckBox
                  ? f.isChecked()
                  : (f as import("pdf-lib").PDFTextField).getText() || "",
            }));
          if (!cancelled) {
            setFormFields(fields);
            if (!fields.length)
              setError(
                "This PDF has no supported interactive fields. Choose a fillable PDF with text fields or checkboxes.",
              );
          }
          return;
        }
        if (toolId === "organize-pdf" && first.count > 80)
          throw Error(
            "Organize supports up to 80 pages at a time. Split this PDF first.",
          );
        const doc = await openPDF(first.file);
        try {
          const next: PageItem[] = [];
          const max = toolId === "organize-pdf" ? doc.numPages : 1;
          for (let i = 1; i <= max; i++) {
            if (cancelled) return;
            const p = await renderPage(
              doc,
              i,
              toolId === "organize-pdf" ? 0.35 : 0.7,
            );
            next.push({
              index: i - 1,
              rotation: 0,
              url: p.canvas.toDataURL("image/jpeg", 0.8),
            });
          }
          if (!cancelled) setPages(next);
        } finally {
          await doc.loadingTask.destroy();
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not preview these pages.",
          );
      } finally {
        if (!cancelled) setLoadingPages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files[0]?.id, toolId]);
  function removeFile(id: string) {
    setFiles((v) =>
      v.filter((f) => {
        if (f.id === id && f.url?.startsWith("blob:"))
          URL.revokeObjectURL(f.url);
        return f.id !== id;
      }),
    );
    setCompare(null);
  }
  function moveFile(index: number, delta: number) {
    setFiles((v) => {
      const a = [...v];
      const j = index + delta;
      if (j >= 0 && j < a.length) [a[index], a[j]] = [a[j], a[index]];
      return a;
    });
  }
  function movePage(index: number, delta: number) {
    setPages((v) => {
      const a = [...v];
      const j = index + delta;
      if (j >= 0 && j < a.length) [a[index], a[j]] = [a[j], a[index]];
      return a;
    });
  }
  async function sample() {
    setError("");
    try {
      const out = await runWorker({ tool: "sample" });
      await addFiles([
        new File([out.bytes as BlobPart], out.name, { type: out.type }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the sample.");
    }
  }
  async function compareDocuments(page: number) {
    if (files.length !== 2) throw Error("Select exactly two PDF files.");
    const a = await openPDF(files[0].file);
    let b: Awaited<ReturnType<typeof openPDF>> | undefined;
    try {
      b = await openPDF(files[1].file);
      const max = Math.max(a.numPages, b.numPages);
      const pa = page <= a.numPages ? await renderPage(a, page, 1) : null,
        pb = page <= b.numPages ? await renderPage(b, page, 1) : null;
      const width = Math.ceil(Math.max(pa?.width || 0, pb?.width || 0)),
        height = Math.ceil(Math.max(pa?.height || 0, pb?.height || 0));
      const canvases = [pa, pb].map((p) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const x = c.getContext("2d")!;
        x.fillStyle = "#fff";
        x.fillRect(0, 0, width, height);
        if (p) x.drawImage(p.canvas, 0, 0);
        return c;
      });
      const output = await runWorker(
        {
          tool: "visual-diff",
          a: canvases[0].getContext("2d")!.getImageData(0, 0, width, height)
            .data,
          b: canvases[1].getContext("2d")!.getImageData(0, 0, width, height)
            .data,
          width,
          height,
        },
        () => {},
        controller.current?.signal,
      );
      if (compareRef.current) URL.revokeObjectURL(compareRef.current.diff);
      setCompare({
        a: canvases[0].toDataURL(),
        b: canvases[1].toDataURL(),
        diff: URL.createObjectURL(
          new Blob([output.bytes as BlobPart], { type: output.type }),
        ),
        label: output.name,
        count: max,
      });
      setComparePage(page);
    } finally {
      await a.loadingTask.destroy();
      if (b) await b.loadingTask.destroy();
    }
  }
  async function run() {
    setError("");
    controller.current?.abort();
    const job = new AbortController();
    controller.current = job;
    setStatus("processing");
    setProgress(3);
    setProgressLabel("Reading your files");
    try {
      if (!files.length) throw Error("Select a document to begin.");
      if (toolId === "sign-pdf" && !options.image && !options.signature?.trim())
        throw Error("Type, draw, or upload your signature first.");
      if (toolId === "organize-pdf" && !pages.length)
        throw Error("Wait for your pages to load, and keep at least one page.");
      if (toolId === "compare-pdf") {
        await compareDocuments(comparePage);
        setStatus("idle");
        return;
      }
      const report = (n: number, s: string) => {
        setProgress(n);
        setProgressLabel(s);
      };
      const o = {
        ...options,
        pageOrder: pages.map((p) => ({ index: p.index, rotation: p.rotation })),
      };
      let output: Output;
      if (tool.engine === "service") {
        if (!serviceReady)
          throw Error("This processing service is not connected yet.");
        const body = new FormData();
        body.set("tool", toolId);
        body.set("options", JSON.stringify(o));
        files.forEach((f) => body.append("files", f.file));
        report(20, "Processing with the connected service");
        const response = await fetch("/api/process", {
          method: "POST",
          body,
          signal: job.signal,
        });
        if (!response.ok)
          throw Error(
            ((await response.json()) as { error?: string }).error ||
              "The service could not complete this task.",
          );
        output = {
          bytes: new Uint8Array(await response.arrayBuffer()),
          name:
            response.headers
              .get("content-disposition")
              ?.match(/filename="([^"]+)"/)?.[1] || "processed-document.pdf",
          type: response.headers.get("content-type") || "application/pdf",
        };
      } else if (tool.engine === "render")
        output = await renderTool(toolId, files[0].file, o, report, job.signal);
      else
        output = await runWorker(
          {
            tool: toolId,
            sources: await Promise.all(
              files.map(async (f) => ({
                name: f.file.name,
                bytes: new Uint8Array(await f.file.arrayBuffer()),
                type: f.file.type,
              })),
            ),
            options: o,
          },
          report,
          job.signal,
        );
      if (job.signal.aborted) return;
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
      setResult({
        ...output,
        url: URL.createObjectURL(
          new Blob([output.bytes as BlobPart], { type: output.type }),
        ),
      });
      setProgress(100);
      setStatus("ready");
      addHistory({
        name: output.name,
        tool: toolId,
        size: output.bytes.length,
      });
    } catch (e) {
      if (controller.current !== job) return;
      if (e instanceof Error && e.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "This document could not be processed.",
      );
      setStatus("idle");
    }
  }
  const total = files.reduce((n, f) => n + f.file.size, 0);
  const blocked = tool.engine === "service" && !serviceReady;
  return (
    <MotionConfig reducedMotion="user">
      <Shell active={tool.category} title={tool.name}>
        <div className="workspace">
          <Link href="/" className="back-link">
            <ArrowLeft size={14} />
            All PDF tools
          </Link>
          <div className={"workspace-title " + tool.color}>
            <span className="tool-icon">
              <ToolIcon name={tool.icon} size={30} />
            </span>
            <div>
              <h1>{tool.name}</h1>
              <p>{tool.description}</p>
            </div>
            <span className="local-tag">
              <ShieldCheck size={14} />
              {tool.engine === "service"
                ? "Connected processing"
                : "Files stay on your device"}
            </span>
          </div>
          <div className="workspace-grid">
            <div className="document-area">
              {blocked ? (
                <section className="service-state">
                  <Plug size={32} />
                  <h2>A little more power is needed.</h2>
                  <p>
                    {tool.name} needs a dedicated processing service. This tool
                    is included in the project architecture, but its service is
                    not connected in this foundation release.
                  </p>
                  <p>
                    {["protect-pdf", "unlock-pdf", "repair-pdf"].includes(
                      toolId,
                    )
                      ? "The server adapter is ready for a native PDF processor such as qpdf. Passwords must be handled by that service."
                      : toolId === "pdf-to-pdfa"
                        ? "Archival output must be converted and independently validated before it can be called PDF/A compliant."
                        : "The server adapter is ready for a compatible document processor. No files are uploaded while this tool is unavailable."}
                  </p>
                  <Link className="secondary-btn" href="/">
                    Explore available tools <ArrowRight size={15} />
                  </Link>
                </section>
              ) : (
                <>
                  {status === "idle" && (
                    <>
                      <motion.div
                        animate={{ scale: dragging ? 1.012 : 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 280,
                          damping: 23,
                        }}
                        className={
                          "dropzone " +
                          (dragging ? "dragging " : "") +
                          (files.length ? "compact" : "")
                        }
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (e.dataTransfer.types.includes("Files"))
                            setDragging(true);
                        }}
                        onDragLeave={(e) => {
                          if (
                            !e.currentTarget.contains(e.relatedTarget as Node)
                          )
                            setDragging(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          void addFiles(Array.from(e.dataTransfer.files));
                        }}
                      >
                        <div className="upload-icon">
                          {reading ? (
                            <Loader2 className="animate-spin" size={29} />
                          ) : (
                            <FileUp size={32} strokeWidth={1.5} />
                          )}
                        </div>
                        <div>
                          <h2>
                            {reading
                              ? "Reading your files…"
                              : files.length
                                ? "Add another document"
                                : "A fresh start for your files."}
                          </h2>
                          <p>
                            {reading
                              ? "Preparing previews on your device"
                              : files.length
                                ? "Drop files here to add to your queue"
                                : "Drag & drop your " +
                                  (tool.accept === ".pdf"
                                    ? "PDF" + (tool.multiple ? "s" : "")
                                    : "files") +
                                  " here, or pick them below."}
                          </p>
                        </div>
                        <button
                          className="primary-btn"
                          disabled={reading}
                          onClick={() => input.current?.click()}
                        >
                          <Plus size={17} />
                          {files.length
                            ? tool.multiple
                              ? "Add files"
                              : "Replace file"
                            : "Select " +
                              (tool.accept === ".pdf"
                                ? "PDF " + (tool.multiple ? "files" : "file")
                                : "files")}
                        </button>
                        {!files.length && (
                          <p className="drop-hint">
                            {tool.accept.replaceAll(",", " · ").toUpperCase()} ·
                            Up to 25 MB total
                          </p>
                        )}
                      </motion.div>
                      <input
                        ref={input}
                        type="file"
                        className="sr-only"
                        tabIndex={-1}
                        accept={tool.accept}
                        multiple={tool.multiple}
                        onChange={(e) =>
                          void addFiles(Array.from(e.target.files || []))
                        }
                      />
                      <input
                        ref={camera}
                        type="file"
                        className="sr-only"
                        tabIndex={-1}
                        accept="image/*"
                        capture="environment"
                        onChange={(e) =>
                          void addFiles(Array.from(e.target.files || []))
                        }
                      />
                      {!files.length && !reading && (
                        <div className="drop-alt">
                          {tool.engine !== "service" &&
                            tool.accept === ".pdf" && (
                              <button
                                className="text-btn"
                                onClick={() => void sample()}
                              >
                                <FileText size={13} />
                                Try with a sample PDF
                              </button>
                            )}
                          {toolId === "scan-to-pdf" && (
                            <button
                              className="text-btn"
                              onClick={() => camera.current?.click()}
                            >
                              <Camera size={14} />
                              Open camera
                            </button>
                          )}
                        </div>
                      )}
                      {files.length > 0 && (
                        <>
                          <div className="queue-label">
                            <span>
                              {files.length}{" "}
                              {files.length === 1 ? "file" : "files"} selected ·{" "}
                              {formatBytes(total)}
                            </span>
                            <span>Ready when you are.</span>
                          </div>
                          <Reorder.Group
                            axis="y"
                            values={files}
                            onReorder={setFiles}
                            className="file-queue"
                          >
                            {files.map((f, i) => (
                              <Reorder.Item
                                key={f.id}
                                value={f}
                                className="file-row"
                                dragListener={files.length > 1}
                              >
                                <GripVertical size={14} className="file-grip" />
                                {f.url ? (
                                  <img
                                    className="file-preview"
                                    src={f.url}
                                    alt={"Preview of " + f.file.name}
                                  />
                                ) : (
                                  <span className="file-row-icon">
                                    <FileText size={22} />
                                  </span>
                                )}
                                <div className="file-info">
                                  <strong>{f.file.name}</strong>
                                  <span>
                                    {formatBytes(f.file.size)}
                                    {f.count > 0 &&
                                      ` · ${f.count} ${f.count === 1 ? "page" : "pages"}`}
                                  </span>
                                </div>
                                <div className="file-row-actions">
                                  {files.length > 1 && (
                                    <>
                                      <button
                                        className="icon-btn"
                                        disabled={i === 0}
                                        aria-label={
                                          "Move " + f.file.name + " up"
                                        }
                                        onClick={() => moveFile(i, -1)}
                                      >
                                        <ArrowUp size={13} />
                                      </button>
                                      <button
                                        className="icon-btn"
                                        disabled={i === files.length - 1}
                                        aria-label={
                                          "Move " + f.file.name + " down"
                                        }
                                        onClick={() => moveFile(i, 1)}
                                      >
                                        <ArrowDown size={13} />
                                      </button>
                                    </>
                                  )}
                                  <Check size={14} className="file-ready" />
                                  <button
                                    className="icon-btn"
                                    aria-label={"Remove " + f.file.name}
                                    onClick={() => removeFile(f.id)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </Reorder.Item>
                            ))}
                          </Reorder.Group>
                        </>
                      )}
                      {loadingPages && (
                        <div
                          className="loading-skeleton"
                          style={{ marginTop: 20 }}
                        />
                      )}
                      {toolId === "organize-pdf" && pages.length > 0 && (
                        <>
                          <div className="preview-heading">
                            <span>
                              {pages.length} pages · Drag to rearrange
                            </span>
                            <span className="muted">
                              Changes are applied on export
                            </span>
                          </div>
                          <div className="page-grid">
                            {pages.map((p, i) => (
                              <motion.div
                                layout
                                key={p.index}
                                className="page-tile"
                                draggable
                                onDragStart={() => {
                                  pageDrag.current = i;
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const from = pageDrag.current;
                                  if (from === null) return;
                                  setPages((v) => {
                                    const a = [...v];
                                    const [item] = a.splice(from, 1);
                                    a.splice(i, 0, item);
                                    return a;
                                  });
                                  pageDrag.current = null;
                                }}
                              >
                                <img
                                  src={p.url}
                                  alt={"Original page " + (p.index + 1)}
                                  style={{
                                    transform: `rotate(${p.rotation}deg)`,
                                  }}
                                />
                                <div className="page-tile-footer">
                                  <span>Page {p.index + 1}</span>
                                  <div>
                                    <button
                                      aria-label={
                                        "Move page " +
                                        (p.index + 1) +
                                        " earlier"
                                      }
                                      disabled={i === 0}
                                      onClick={() => movePage(i, -1)}
                                    >
                                      <ArrowLeft size={11} />
                                    </button>
                                    <button
                                      aria-label={
                                        "Move page " + (p.index + 1) + " later"
                                      }
                                      disabled={i === pages.length - 1}
                                      onClick={() => movePage(i, 1)}
                                    >
                                      <ArrowRight size={11} />
                                    </button>
                                    <button
                                      aria-label={
                                        "Rotate page " + (p.index + 1)
                                      }
                                      onClick={() =>
                                        setPages((v) =>
                                          v.map((x, j) =>
                                            j === i
                                              ? {
                                                  ...x,
                                                  rotation:
                                                    (x.rotation + 90) % 360,
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                    >
                                      <RotateCw size={11} />
                                    </button>
                                    <button
                                      aria-label={
                                        "Remove page " + (p.index + 1)
                                      }
                                      disabled={pages.length === 1}
                                      onClick={() =>
                                        setPages((v) =>
                                          v.filter((_, j) => j !== i),
                                        )
                                      }
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </>
                      )}
                      {["crop-pdf", "redact-pdf"].includes(toolId) &&
                        pages[0] && (
                          <>
                            <div className="preview-heading">
                              <span>
                                {toolId === "crop-pdf"
                                  ? "Keep the selected area"
                                  : "Permanently cover the selected area"}
                              </span>
                              <span>Page 1 preview</span>
                            </div>
                            <CropPreview
                              url={pages[0].url}
                              crop={options.crop}
                              onChange={(crop) => set({ crop })}
                            />
                          </>
                        )}
                      {compare && (
                        <>
                          <div className="compare-controls">
                            <button
                              className="icon-btn"
                              disabled={comparePage === 1}
                              onClick={() => {
                                setStatus("processing");
                                controller.current = new AbortController();
                                void compareDocuments(comparePage - 1)
                                  .catch((e) => setError(e.message))
                                  .finally(() => setStatus("idle"));
                              }}
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <span>
                              Page {comparePage} of {compare.count}
                            </span>
                            <button
                              className="icon-btn"
                              disabled={comparePage === compare.count}
                              onClick={() => {
                                setStatus("processing");
                                controller.current = new AbortController();
                                void compareDocuments(comparePage + 1)
                                  .catch((e) => setError(e.message))
                                  .finally(() => setStatus("idle"));
                              }}
                            >
                              <ChevronRight size={16} />
                            </button>
                            <span>{compare.label}</span>
                          </div>
                          <Pick
                            label="Comparison view"
                            value={compareView}
                            choices={[
                              ["side", "Side by side"],
                              ["diff", "Highlight differences"],
                            ]}
                            onChange={setCompareView}
                          />
                          {compareView === "side" ? (
                            <div className="compare-grid">
                              <div>
                                <h3>Original</h3>
                                <img src={compare.a} alt="Original PDF page" />
                              </div>
                              <div>
                                <h3>Updated</h3>
                                <img src={compare.b} alt="Updated PDF page" />
                              </div>
                            </div>
                          ) : (
                            <img
                              style={{ width: "100%", marginTop: 15 }}
                              src={compare.diff}
                              alt="PDF differences highlighted in red"
                            />
                          )}
                        </>
                      )}
                    </>
                  )}
                  {status === "processing" && (
                    <div
                      className="processing"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="progress-ring">
                        <svg width="94" height="94" viewBox="0 0 94 94">
                          <circle
                            cx="47"
                            cy="47"
                            r="41"
                            stroke="var(--surface)"
                            strokeWidth="4"
                            fill="none"
                          />
                          <motion.circle
                            cx="47"
                            cy="47"
                            r="41"
                            stroke="var(--red)"
                            strokeWidth="4"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={258}
                            animate={{
                              strokeDashoffset: 258 * (1 - progress / 100),
                            }}
                          />
                        </svg>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <h2>A little magic in progress.</h2>
                      <p>{progressLabel}</p>
                      <div className="progress-steps">
                        <span className={progress < 20 ? "active" : ""}>
                          <Check size={12} />
                          Reading
                        </span>
                        <ArrowRight size={12} />
                        <span className={progress >= 20 ? "active" : ""}>
                          Processing
                        </span>
                        <ArrowRight size={12} />
                        <span>Ready</span>
                      </div>
                      <button
                        className="text-btn"
                        onClick={() => {
                          controller.current?.abort();
                          setStatus("idle");
                        }}
                      >
                        Cancel processing
                      </button>
                    </div>
                  )}
                  {status === "ready" && result && (
                    <div
                      className="processing"
                      style={{ position: "relative" }}
                    >
                      <div className="celebration" aria-hidden="true">
                        {Array.from({ length: 18 }, (_, i) => (
                          <motion.span
                            key={i}
                            className="confetti"
                            style={{
                              background: [
                                "#ff515e",
                                "#b29bea",
                                "#76c69f",
                                "#e9bd70",
                              ][i % 4],
                            }}
                            initial={{ x: 0, y: 0, opacity: 1 }}
                            animate={{
                              x: Math.cos(i * 2.4) * 170,
                              y: Math.sin(i * 2.4) * 130 + 80,
                              opacity: 0,
                              rotate: i * 70,
                            }}
                            transition={{ duration: 1.5, delay: 0.15 }}
                          />
                        ))}
                      </div>
                      <motion.div
                        className="success-icon"
                        initial={{ scale: 0.4 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 240,
                          damping: 13,
                        }}
                      >
                        <Check size={32} />
                      </motion.div>
                      <h2>And just like that, done.</h2>
                      <p>Your document is ready for its next chapter.</p>
                      <div className="success-meta">
                        {result.name} · {formatBytes(result.bytes.length)}
                        {toolId === "compress-pdf" &&
                          ` · ${Math.round((1 - result.bytes.length / total) * 100)}% smaller`}
                      </div>
                      <div className="result-actions">
                        <a
                          className="primary-btn"
                          href={result.url}
                          download={result.name}
                        >
                          <Download size={17} />
                          Download{" "}
                          {result.type === "application/zip" ? "ZIP" : "file"}
                        </a>
                        {result.type === "application/pdf" && (
                          <a
                            className="secondary-btn"
                            href={result.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View PDF <ArrowRight size={15} />
                          </a>
                        )}
                      </div>
                      <button
                        className="text-btn"
                        style={{ marginTop: 18 }}
                        onClick={() => {
                          setStatus("idle");
                          setError("");
                        }}
                      >
                        <RotateCw size={12} />
                        Back to editing
                      </button>
                    </div>
                  )}
                </>
              )}
              {error && (
                <div className="tool-notice error-notice" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              {tool.note && (
                <div className="tool-notice">
                  <Info size={15} />
                  <span>{tool.note}</span>
                </div>
              )}
              {tool.engine === "service" && serviceReady && (
                <div className="tool-notice">
                  <Info size={15} />
                  <span>
                    Running this tool uploads your document to the processing
                    service configured by the site owner.
                  </span>
                </div>
              )}
            </div>
            <motion.aside
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="tool-panel"
            >
              <div className="panel-title">
                <SlidersHorizontal size={16} />
                Make it your own
              </div>
              <fieldset
                disabled={status === "processing" || blocked}
                style={{ border: 0, padding: 0, margin: 0 }}
              >
                <div className="panel-fields">
                  <Controls
                    tool={toolId}
                    o={options}
                    set={set}
                    formFields={formFields}
                  />
                  {[
                    "pdf-to-word",
                    "pdf-to-powerpoint",
                    "pdf-to-excel",
                    "pdf-to-markdown",
                  ].includes(toolId) && (
                    <p className="field-note">
                      All pages are included. Your converted file downloads when
                      processing is complete.
                    </p>
                  )}
                  {toolId === "compare-pdf" && (
                    <p className="field-note">
                      Add two PDFs, then compare their pages side by side or
                      highlight changed pixels. Blank pages indicate a page
                      missing from one version.
                    </p>
                  )}
                  {toolId === "ocr-pdf" && (
                    <p className="field-note">
                      Language: English. Clear, upright scans work best. Review
                      names, numbers, and small print in the result.
                    </p>
                  )}
                </div>
              </fieldset>
              <div className="panel-bottom">
                <button
                  className="primary-btn"
                  disabled={
                    !files.length ||
                    reading ||
                    status !== "idle" ||
                    blocked ||
                    loadingPages ||
                    (toolId === "pdf-forms" && !formFields.length)
                  }
                  onClick={() => void run()}
                >
                  {status === "processing" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Working…
                    </>
                  ) : (
                    <>
                      {toolId === "compare-pdf"
                        ? "Compare documents"
                        : toolId === "workflow"
                          ? "Run workflow"
                          : tool.name}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
                <p>
                  {blocked
                    ? "Processing service required"
                    : status === "ready"
                      ? "Your file is ready to download"
                      : files.length
                        ? `${files.length} ${files.length === 1 ? "file" : "files"} · ${formatBytes(total)}`
                        : "Select a file to get started"}
                </p>
              </div>
            </motion.aside>
          </div>
        </div>
      </Shell>
    </MotionConfig>
  );
}
function CropPreview({
  url,
  crop,
  onChange,
}: {
  url: string;
  crop: PDFOptions["crop"];
  onChange: (v: PDFOptions["crop"]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    crop: PDFOptions["crop"];
    resize: boolean;
  } | null>(null);
  return (
    <div className="crop-preview" ref={container}>
      <img src={url} alt="Page with editable selection" />
      <div
        className="crop-box"
        style={{
          left: crop.x + "%",
          top: crop.y + "%",
          width: crop.width + "%",
          height: crop.height + "%",
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            crop: { ...crop },
            resize: (e.target as HTMLElement).classList.contains("crop-handle"),
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !container.current) return;
          const r = container.current.getBoundingClientRect(),
            dx = ((e.clientX - d.x) / r.width) * 100,
            dy = ((e.clientY - d.y) / r.height) * 100;
          if (d.resize)
            onChange({
              ...d.crop,
              width: Math.max(3, Math.min(100 - d.crop.x, d.crop.width + dx)),
              height: Math.max(3, Math.min(100 - d.crop.y, d.crop.height + dy)),
            });
          else
            onChange({
              ...d.crop,
              x: Math.max(0, Math.min(100 - d.crop.width, d.crop.x + dx)),
              y: Math.max(0, Math.min(100 - d.crop.height, d.crop.y + dy)),
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span className="crop-handle" />
      </div>
    </div>
  );
}
