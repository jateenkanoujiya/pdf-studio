import type { Output, PDFOptions } from "./types";
import { createPDFWorker } from "./worker-factory";
export function runWorker(
  payload: Record<string, unknown>,
  onProgress: (n: number, s: string) => void = () => {},
  signal?: AbortSignal,
): Promise<Output> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Cancelled", "AbortError"));
    const worker = createPDFWorker();
    const timer = setTimeout(
      () =>
        finish(new Error("Processing took too long. Try a smaller document.")),
      180000,
    );
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    const finish = (error?: Error, result?: Output) => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result!);
    };
    worker.onerror = () =>
      finish(
        new Error(
          "The PDF engine could not start. Please refresh and try again.",
        ),
      );
    worker.onmessage = (e) => {
      if (e.data.type === "progress") onProgress(e.data.value, e.data.label);
      if (e.data.type === "error") finish(new Error(e.data.message));
      if (e.data.type === "result") finish(undefined, e.data.result);
    };
    worker.postMessage(payload);
  });
}
let pdfModule: Promise<typeof import("pdfjs-dist")> | undefined;
export async function getPDFJS() {
  pdfModule ??= import("pdfjs-dist");
  const m = await pdfModule;
  m.GlobalWorkerOptions.workerSrc = "/engines/pdfjs/pdf.worker.min.mjs";
  return m;
}
export async function openPDF(file: File) {
  const pdfjs = await getPDFJS();
  return pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/engines/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/engines/pdfjs/standard_fonts/",
    wasmUrl: "/engines/pdfjs/wasm/",
  }).promise;
}
export async function renderPage(
  doc: Awaited<ReturnType<typeof openPDF>>,
  index: number,
  scale = 1,
) {
  const page = await doc.getPage(index);
  const vp = page.getViewport({ scale });
  if (vp.width * vp.height > 16000000)
    throw Error("This page is too large to render. Try a smaller page size.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, viewport: vp }).promise;
  return { canvas, width: vp.width / scale, height: vp.height / scale };
}
export async function thumbnail(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf"))
    return { url: URL.createObjectURL(file), count: 1 };
  const doc = await openPDF(file);
  try {
    const { canvas } = await renderPage(doc, 1, 0.3);
    return { url: canvas.toDataURL("image/jpeg", 0.75), count: doc.numPages };
  } finally {
    await doc.loadingTask.destroy();
  }
}
export async function renderTool(
  tool: string,
  file: File,
  o: PDFOptions,
  progress: (n: number, s: string) => void,
  signal: AbortSignal,
): Promise<Output> {
  const doc = await openPDF(file);
  const base = file.name.replace(/\.pdf$/i, "");
  const pages: any[] = [],
    textPages: string[][] = [],
    outputs: Output[] = [];
  let ocr: any;
  try {
    if (doc.numPages > 100)
      throw Error(
        "For image and text conversion, split documents into batches of 100 pages or fewer.",
      );
    if (tool === "ocr-pdf") {
      const { createWorker } = await import("tesseract.js");
      progress(8, "Loading the English recognition model");
      ocr = await createWorker("eng", 1, {
        workerPath: "/engines/tesseract/worker.min.js",
        corePath: "/engines/tesseract/core",
        logger: (m: any) => {
          if (m.status === "loading language traineddata")
            progress(10, "Downloading recognition model");
        },
      });
    }
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      progress(
        15 + ((i - 1) / doc.numPages) * 65,
        `${tool === "ocr-pdf" ? "Recognizing" : "Reading"} page ${i} of ${doc.numPages}`,
      );
      if (["pdf-to-word", "pdf-to-excel", "pdf-to-markdown"].includes(tool)) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const lines: string[] = [];
        let line = "",
          lastY: number | undefined,
          lastEnd = 0;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5],
            x = item.transform[4];
          if (lastY !== undefined && Math.abs(y - lastY) > 3) {
            if (line.trim()) lines.push(line.trim());
            line = "";
            lastEnd = 0;
          }
          line += (line ? (x - lastEnd > 15 ? "  " : " ") : "") + item.str;
          lastY = y;
          lastEnd = x + item.width;
          if (item.hasEOL) {
            lines.push(line.trim());
            line = "";
            lastY = undefined;
          }
        }
        if (line.trim()) lines.push(line.trim());
        textPages.push(lines);
        continue;
      }
      const scale =
        tool === "compress-pdf"
          ? { extreme: 0.8, recommended: 1.2, low: 1.7 }[o.compression] || 1.2
          : 1.5;
      const p = await renderPage(doc, i, scale);
      if (tool === "redact-pdf") {
        const ctx = p.canvas.getContext("2d")!;
        const c = o.crop;
        ctx.fillStyle = "#000";
        ctx.fillRect(
          (p.canvas.width * c.x) / 100,
          (p.canvas.height * c.y) / 100,
          (p.canvas.width * c.width) / 100,
          (p.canvas.height * c.height) / 100,
        );
      }
      const type = tool === "pdf-to-png" ? "image/png" : "image/jpeg";
      const quality =
        tool === "compress-pdf"
          ? { extreme: 0.45, recommended: 0.65, low: 0.85 }[o.compression] ||
            0.65
          : 0.94;
      const blob = await new Promise<Blob>((resolve, reject) =>
        p.canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("Unable to render this page.")),
          type,
          quality,
        ),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (["pdf-to-jpg", "pdf-to-png"].includes(tool))
        outputs.push({
          bytes,
          type,
          name: `${base}-page-${String(i).padStart(3, "0")}.${type === "image/png" ? "png" : "jpg"}`,
        });
      else if (tool === "ocr-pdf") {
        const dataUrl = p.canvas.toDataURL("image/jpeg", 0.94);
        const abortOCR = () => {
          void ocr.terminate();
        };
        signal.addEventListener("abort", abortOCR, { once: true });
        let data;
        try {
          data = (
            await ocr.recognize(p.canvas, {}, { text: true, blocks: true })
          ).data;
        } finally {
          signal.removeEventListener("abort", abortOCR);
        }
        pages.push({
          ...p,
          canvas: undefined,
          bytes,
          dataUrl,
          text: data.text,
          blocks: data.blocks,
          scale,
        });
      } else
        pages.push({
          bytes,
          width: p.width,
          height: p.height,
          dataUrl:
            tool === "pdf-to-powerpoint"
              ? p.canvas.toDataURL("image/jpeg", 0.9)
              : undefined,
        });
      p.canvas.width = 0;
      p.canvas.height = 0;
    }
    if (
      ["pdf-to-word", "pdf-to-excel", "pdf-to-markdown"].includes(tool) &&
      textPages.every((p) => !p.some((t) => t.trim()))
    )
      throw Error(
        "No selectable text found. Run OCR PDF first for scanned documents.",
      );
    if (tool === "pdf-to-markdown")
      return {
        bytes: new TextEncoder().encode(
          textPages
            .map((lines, i) => `# Page ${i + 1}\n\n${lines.join("\n\n")}`)
            .join("\n\n---\n\n"),
        ),
        name: base + ".md",
        type: "text/markdown",
      };
    if (tool === "ocr-pdf") {
      return runWorker(
        {
          tool: "ocr-output",
          pages,
          options: { name: base + "-searchable.pdf" },
        },
        progress,
        signal,
      );
    }
    if (["pdf-to-jpg", "pdf-to-png"].includes(tool))
      return runWorker({ tool: "zip", outputs }, progress, signal);
    if (["compress-pdf", "redact-pdf"].includes(tool)) {
      const result = await runWorker(
        {
          tool: "raster-pdf",
          pages,
          options: {
            name:
              base +
              (tool === "compress-pdf" ? "-compressed" : "-redacted") +
              ".pdf",
          },
        },
        progress,
        signal,
      );
      if (tool === "compress-pdf" && result.bytes.length >= file.size)
        throw Error(
          "This PDF is already compact. Compression would make it larger. Try another tier; your original file is unchanged.",
        );
      return result;
    }
    return runWorker(
      {
        tool,
        textPages,
        pages,
        options: {
          name:
            base +
            ({
              "pdf-to-word": ".docx",
              "pdf-to-excel": ".xlsx",
              "pdf-to-powerpoint": ".pptx",
            }[tool] || ".pdf"),
        },
      },
      progress,
      signal,
    );
  } finally {
    if (ocr) await ocr.terminate();
    await doc.loadingTask.destroy();
  }
}
