import { processLocal, packageOutputs } from "../lib/pdf/engine";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { jsPDF } from "jspdf";
self.onmessage = async (e) => {
  const { tool, sources, options, pages, textPages, outputs } = e.data;
  const progress = (value: number, label: string) =>
    self.postMessage({ type: "progress", value, label });
  try {
    let result;
    if (tool === "zip") {
      result = await packageOutputs(outputs);
    } else if (tool === "raster-pdf") {
      const doc = await PDFDocument.create();
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const img = await doc.embedJpg(p.bytes);
        doc
          .addPage([p.width, p.height])
          .drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
        progress(25 + ((i + 1) / pages.length) * 70, "Rebuilding your PDF");
      }
      result = {
        bytes: await doc.save(),
        name: options.name,
        type: "application/pdf",
      };
    } else if (tool === "ocr-output") {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const p of pages) {
        const page = doc.addPage([p.width, p.height]);
        const img = await doc.embedJpg(p.bytes);
        page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
        const words = (p.blocks || []).flatMap((b: any) =>
          (b.paragraphs || []).flatMap((p: any) =>
            (p.lines || []).flatMap((l: any) => l.words || []),
          ),
        );
        if (!words.length && p.text?.trim())
          throw Error(
            "Recognition produced no word positions. Try a clearer scan.",
          );
        for (const word of words) {
          const text = word.text.replace(/[^\x20-\x7E]/g, "?");
          if (!text.trim()) continue;
          const b = word.bbox;
          const size = Math.max(4, ((b.y1 - b.y0) / p.scale) * 0.85);
          page.drawText(text, {
            x: b.x0 / p.scale,
            y: p.height - b.y1 / p.scale,
            size,
            font,
            opacity: 0,
          });
        }
      }
      result = {
        bytes: await doc.save(),
        name: options.name,
        type: "application/pdf",
      };
    } else if (tool === "visual-diff") {
      const a = e.data.a,
        b = e.data.b;
      const out = new Uint8ClampedArray(a.length);
      let changed = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta =
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
        const yes = delta > 90;
        if (yes) changed++;
        out[i] = yes ? 255 : Math.round((a[i] + b[i]) / 2);
        out[i + 1] = yes ? 75 : Math.round((a[i + 1] + b[i + 1]) / 2);
        out[i + 2] = yes ? 95 : Math.round((a[i + 2] + b[i + 2]) / 2);
        out[i + 3] = 255;
      }
      const canvas = new OffscreenCanvas(e.data.width, e.data.height);
      canvas
        .getContext("2d")!
        .putImageData(new ImageData(out, e.data.width, e.data.height), 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      result = {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        name: `${((changed / (a.length / 4)) * 100).toFixed(1)}% pixels changed`,
        type: "image/png",
      };
    } else if (tool === "pdf-to-word") {
      const { Document, Packer, Paragraph, TextRun, PageBreak } =
        await import("docx");
      const children = textPages.flatMap((lines: string[], i: number) => [
        ...(i ? [new Paragraph({ children: [new PageBreak()] })] : []),
        ...lines.map(
          (line) => new Paragraph({ children: [new TextRun(line)] }),
        ),
      ]);
      result = {
        bytes: new Uint8Array(
          await Packer.toArrayBuffer(
            new Document({ sections: [{ children }] }),
          ),
        ),
        name: options.name,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    } else if (tool === "pdf-to-excel") {
      const { default: writeXlsxFile } =
        await import("write-excel-file/browser");
      const rows = textPages.flatMap((lines: string[], i: number) => [
        [{ value: `Page ${i + 1}`, fontWeight: "bold" }],
        ...lines.map((line) =>
          line.split(/\s{2,}/).map((value) => ({ value, type: String })),
        ),
      ]);
      const blob = await writeXlsxFile(rows).toBlob();
      result = {
        bytes: new Uint8Array(await (blob as Blob).arrayBuffer()),
        name: options.name,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } else if (tool === "pdf-to-powerpoint") {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      const first = pages[0];
      pptx.defineLayout({
        name: "PDF",
        width: first.width / 72,
        height: first.height / 72,
      });
      pptx.layout = "PDF";
      for (const p of pages) {
        const slide = pptx.addSlide();
        const scale = Math.min(first.width / p.width, first.height / p.height);
        slide.addImage({
          data: p.dataUrl,
          x: (first.width - p.width * scale) / 144,
          y: (first.height - p.height * scale) / 144,
          w: (p.width * scale) / 72,
          h: (p.height * scale) / 72,
        });
      }
      result = {
        bytes: new Uint8Array(
          (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer,
        ),
        name: options.name,
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
    } else if (tool === "sample") {
      const doc = new jsPDF();
      for (let i = 0; i < 3; i++) {
        if (i) doc.addPage();
        doc.setFillColor(248, 248, 251);
        doc.rect(0, 0, 210, 297, "F");
        doc.setFillColor(245, 81, 94);
        doc.roundedRect(18, 20, 12, 12, 3, 3, "F");
        doc.setTextColor(30, 31, 39);
        doc.setFontSize(13);
        doc.text("PDF STUDIO / SAMPLE DOCUMENT", 36, 28);
        doc.setFontSize(32);
        doc.text(["Make room for", "what matters."][i % 2], 18, 65);
        doc.setFontSize(12);
        doc.setTextColor(105, 106, 119);
        doc.text(
          `Sample page ${i + 1} of 3. Try rotating, splitting, or adding a watermark.`,
          18,
          85,
        );
        doc.setDrawColor(210, 211, 218);
        for (let j = 0; j < 6; j++)
          doc.line(18, 110 + j * 17, 190 - j * 9, 110 + j * 17);
        doc.setTextColor(245, 81, 94);
        doc.text(String(i + 1).padStart(2, "0"), 18, 276);
      }
      result = {
        bytes: new Uint8Array(doc.output("arraybuffer")),
        name: "studio-sample.pdf",
        type: "application/pdf",
      };
    } else result = await processLocal(tool, sources, options, progress);
    progress(100, "Ready");
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to process this document.",
    });
  }
};
