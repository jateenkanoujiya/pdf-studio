import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  PDFTextField,
  PDFCheckBox,
} from "pdf-lib";
import JSZip from "jszip";
import { parseRange, type PDFOptions, type Output } from "./types";
export type Source = { name: string; bytes: Uint8Array; type: string };
const safeText = (s: string) => s.replace(/[^\x20-\x7E\n\r]/g, "?");
const output = (
  bytes: Uint8Array,
  name: string,
  type = "application/pdf",
): Output => ({ bytes, name, type });
export async function packageOutputs(files: Output[]): Promise<Output> {
  if (files.length === 1) return files[0];
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f.bytes));
  return output(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
    "pdf-studio-files.zip",
    "application/zip",
  );
}
export async function processLocal(
  tool: string,
  sources: Source[],
  o: PDFOptions,
  progress: (n: number, label: string) => void = () => {},
): Promise<Output> {
  if (!sources.length) throw Error("Select a file first.");
  const base = sources[0].name.replace(/\.[^.]+$/, "");
  progress(10, "Reading your document");
  if (tool === "workflow") {
    let current = sources;
    let result: Output | undefined;
    const steps = o.steps || [];
    if (!steps.length) throw Error("This workflow has no steps.");
    for (let i = 0; i < steps.length; i++) {
      if (!["rotate-pdf", "page-numbers", "watermark"].includes(steps[i]))
        throw Error("This workflow contains an unsupported step.");
      result = await processLocal(steps[i], current, o);
      current = [{ name: result.name, bytes: result.bytes, type: result.type }];
      progress(
        15 + ((i + 1) / steps.length) * 80,
        `Finishing step ${i + 1} of ${steps.length}`,
      );
    }
    return { ...result!, name: base + "-workflow.pdf" };
  }
  if (["jpg-to-pdf", "png-to-pdf", "scan-to-pdf"].includes(tool)) {
    const doc = await PDFDocument.create();
    const dims: [number, number] =
      o.orientation === "landscape" ? [841.89, 595.28] : [595.28, 841.89];
    const grid = o.grid || 1,
      cols = grid > 1 ? 2 : 1,
      rows = grid === 4 ? 2 : 1;
    let page = doc.addPage(dims);
    for (let i = 0; i < sources.length; i++) {
      if (i && i % grid === 0) page = doc.addPage(dims);
      const src = sources[i];
      const img =
        src.bytes[0] === 137
          ? await doc.embedPng(src.bytes)
          : await doc.embedJpg(src.bytes);
      const cellW = (dims[0] - 2 * o.margin) / cols,
        cellH = (dims[1] - 2 * o.margin) / rows;
      if (cellW <= 0 || cellH <= 0) throw Error("Margins are too large.");
      const fit = img.scaleToFit(cellW - 8, cellH - 8);
      const cell = i % grid;
      page.drawImage(img, {
        x: o.margin + (cell % cols) * cellW + (cellW - fit.width) / 2,
        y:
          dims[1] -
          o.margin -
          (Math.floor(cell / cols) + 1) * cellH +
          (cellH - fit.height) / 2,
        width: fit.width,
        height: fit.height,
      });
      progress(15 + ((i + 1) / sources.length) * 75, "Arranging your images");
    }
    return output(await doc.save(), base + ".pdf");
  }
  if (tool === "merge-pdf") {
    const doc = await PDFDocument.create();
    for (let i = 0; i < sources.length; i++) {
      const src = await PDFDocument.load(sources[i].bytes);
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
      progress(
        15 + ((i + 1) / sources.length) * 75,
        `Merging document ${i + 1} of ${sources.length}`,
      );
    }
    return output(await doc.save(), "merged-document.pdf");
  }
  const doc = await PDFDocument.load(sources[0].bytes);
  const count = doc.getPageCount();
  if (!count) throw Error("This PDF has no pages.");
  const selected = parseRange(o.range, count);
  if (
    ["split-pdf", "extract-pages", "remove-pages", "organize-pdf"].includes(
      tool,
    )
  ) {
    let groups: number[][] = [];
    if (tool === "split-pdf") {
      if (o.splitMode === "all") groups = doc.getPageIndices().map((i) => [i]);
      else if (o.splitMode === "fixed") {
        const n = Math.max(1, Math.floor(o.chunkSize));
        for (let i = 0; i < count; i += n)
          groups.push(doc.getPageIndices().slice(i, i + n));
      } else groups = [selected];
    }
    if (tool === "extract-pages") groups = [selected];
    if (tool === "remove-pages") {
      if (!o.range.trim()) throw Error("Enter the pages you want to remove.");
      groups = [doc.getPageIndices().filter((i) => !selected.includes(i))];
    }
    if (tool === "organize-pdf")
      groups = [o.pageOrder?.map((p) => p.index) || doc.getPageIndices()];
    const files: Output[] = [];
    for (let g = 0; g < groups.length; g++) {
      if (!groups[g].length) throw Error("Keep at least one page.");
      const target = await PDFDocument.create();
      const copied = await target.copyPages(doc, groups[g]);
      copied.forEach((p, i) => {
        if (tool === "organize-pdf" && o.pageOrder)
          p.setRotation(
            degrees((p.getRotation().angle + o.pageOrder[i].rotation) % 360),
          );
        target.addPage(p);
      });
      files.push(
        output(
          await target.save(),
          `${base}-${tool === "split-pdf" ? "part-" + (g + 1) : "edited"}.pdf`,
        ),
      );
      progress(15 + ((g + 1) / groups.length) * 75, "Preparing your pages");
    }
    return packageOutputs(files);
  }
  if (tool === "pdf-forms") {
    const form = doc.getForm();
    for (const [key, val] of Object.entries(o.fields || {})) {
      const field = form.getField(key);
      if (field instanceof PDFTextField) field.setText(safeText(String(val)));
      if (field instanceof PDFCheckBox) {
        if (val) field.check();
        else field.uncheck();
      }
    }
    form.updateFieldAppearances();
    return output(await doc.save(), base + "-filled.pdf");
  }
  const font = await doc.embedFont(
    tool === "sign-pdf"
      ? StandardFonts.TimesRomanItalic
      : StandardFonts.Helvetica,
  );
  let image;
  if (o.image)
    image =
      o.image[0] === 137
        ? await doc.embedPng(o.image)
        : await doc.embedJpg(o.image);
  for (let j = 0; j < selected.length; j++) {
    const i = selected[j],
      p = doc.getPage(i),
      { width: w, height: h } = p.getSize();
    if (tool === "rotate-pdf")
      p.setRotation(degrees((p.getRotation().angle + o.rotation) % 360));
    else if (tool === "crop-pdf") {
      if (p.getRotation().angle % 360 !== 0)
        throw Error(
          "Crop currently requires upright page coordinates. Use Rotate PDF to remove existing page rotation first.",
        );
      const c = o.crop;
      const box = p.getCropBox();
      p.setCropBox(
        box.x + (box.width * c.x) / 100,
        box.y + (box.height * (100 - c.y - c.height)) / 100,
        (box.width * c.width) / 100,
        (box.height * c.height) / 100,
      );
    } else if (
      ["page-numbers", "watermark", "edit-pdf", "sign-pdf"].includes(tool)
    ) {
      const text = safeText(
        tool === "page-numbers"
          ? String(o.startIndex + j)
          : tool === "sign-pdf"
            ? o.signature || "Your signature"
            : o.text,
      );
      const fs = Math.max(8, Math.min(o.fontSize, 144));
      const tw = font.widthOfTextAtSize(text, fs);
      let x = o.position.includes("left")
        ? o.margin
        : o.position.includes("right")
          ? w - o.margin - tw
          : (w - tw) / 2;
      let y = o.position.includes("top")
        ? h - o.margin - fs
        : o.position.includes("bottom")
          ? o.margin
          : (h - fs) / 2;
      if (image && ["watermark", "sign-pdf"].includes(tool)) {
        const dim = image.scaleToFit(w * 0.4, h * 0.22);
        x = o.position.includes("left")
          ? o.margin
          : o.position.includes("right")
            ? w - o.margin - dim.width
            : (w - dim.width) / 2;
        y = o.position.includes("top")
          ? h - o.margin - dim.height
          : o.position.includes("bottom")
            ? o.margin
            : (h - dim.height) / 2;
        p.drawImage(image, {
          x,
          y,
          width: dim.width,
          height: dim.height,
          opacity: tool === "sign-pdf" ? 1 : o.opacity,
          rotate: degrees(tool === "watermark" ? o.rotation : 0),
        });
      } else
        p.drawText(text, {
          x: Math.max(0, x),
          y: Math.max(0, y),
          size: fs,
          font,
          color: rgb(0.16, 0.17, 0.2),
          opacity: tool === "watermark" ? o.opacity : 1,
          rotate: degrees(tool === "watermark" ? o.rotation : 0),
        });
    } else
      throw Error("This operation requires a different processing engine.");
    progress(15 + ((j + 1) / selected.length) * 75, "Applying your changes");
  }
  return output(
    await doc.save({ useObjectStreams: true }),
    base + "-" + tool.replace("-pdf", "") + ".pdf",
  );
}
