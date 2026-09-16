import ts from "typescript";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { PDFDocument, degrees, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
const dir = ".sites-runtime/pdf-checks";
await mkdir(dir, { recursive: true });
for (const [source, target] of [
  ["lib/pdf/types.ts", "types"],
  ["lib/pdf/engine.ts", "engine"],
  ["workers/pdf.worker.ts", "worker"],
]) {
  let code = ts.transpileModule(await readFile(source, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  code = code
    .replace(/(["'])\.\/types\1/g, '"./types.mjs"')
    .replace(/(["'])\.\.\/lib\/pdf\/engine\1/g, '"./engine.mjs"');
  await writeFile(`${dir}/${target}.mjs`, code);
}
const { processLocal } = await import(
  pathToFileURL(`${process.cwd()}/${dir}/engine.mjs`).href
);
const { defaultOptions, parseRange } = await import(
  pathToFileURL(`${process.cwd()}/${dir}/types.mjs`).href
);
let n = 0;
const check = (title) => {
  n++;
  console.log("PASS " + title);
};
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 3; i++) {
  const p = doc.addPage([400 + i * 10, 600]);
  p.drawText("Original page " + (i + 1), { x: 30, y: 500, font });
}
const bytes = await doc.save();
const source = { name: "input.pdf", bytes, type: "application/pdf" };
const run = (tool, options = {}) =>
  processLocal(tool, [source], { ...defaultOptions, ...options });
const merged = await processLocal(
  "merge-pdf",
  [source, source],
  defaultOptions,
);
assert.equal((await PDFDocument.load(merged.bytes)).getPageCount(), 6);
check("Merge retains all pages");
const extract = await PDFDocument.load(
  (await run("extract-pages", { range: "3,1" })).bytes,
);
assert.deepEqual(
  extract.getPages().map((p) => p.getWidth()),
  [420, 400],
);
check("Extraction preserves requested order");
const split = await run("split-pdf", { splitMode: "all" });
const zip = await JSZip.loadAsync(split.bytes);
assert.equal(Object.keys(zip.files).length, 3);
for (const f of Object.values(zip.files))
  assert.equal(
    (await PDFDocument.load(await f.async("uint8array"))).getPageCount(),
    1,
  );
check("Split ZIP contains independent single-page PDFs");
assert.equal(
  (
    await PDFDocument.load((await run("remove-pages", { range: "2" })).bytes)
  ).getPageCount(),
  2,
);
await assert.rejects(() => run("remove-pages", { range: "1-3" }));
check("Removal keeps requested content and refuses empty output");
const rotated = await PDFDocument.load(
  (await run("rotate-pdf", { range: "2", rotation: 90 })).bytes,
);
assert.deepEqual(
  rotated.getPages().map((p) => p.getRotation().angle),
  [0, 90, 0],
);
check("Rotation affects only selected pages");
const organized = await PDFDocument.load(
  (
    await run("organize-pdf", {
      pageOrder: [
        { index: 2, rotation: 180 },
        { index: 0, rotation: 0 },
      ],
    })
  ).bytes,
);
assert.deepEqual(
  organized.getPages().map((p) => p.getWidth()),
  [420, 400],
);
assert.equal(organized.getPage(0).getRotation().angle, 180);
check("Organization reorders, removes, and rotates");
const cropped = await PDFDocument.load(
  (await run("crop-pdf", { crop: { x: 10, y: 10, width: 80, height: 80 } }))
    .bytes,
);
assert.deepEqual(cropped.getPage(0).getCropBox(), {
  x: 40,
  y: 60,
  width: 320,
  height: 480,
});
check("Crop box uses correct coordinate conversion");
for (const tool of ["page-numbers", "watermark", "edit-pdf", "sign-pdf"]) {
  const out = await run(tool, { signature: "Sample Signature" });
  assert.equal((await PDFDocument.load(out.bytes)).getPageCount(), 3);
}
check("Numbers, watermark, annotation, and signature produce readable PDFs");
const flow = await run("workflow", {
  steps: ["rotate-pdf", "page-numbers"],
  rotation: 180,
});
assert.equal(
  (await PDFDocument.load(flow.bytes)).getPage(0).getRotation().angle,
  180,
);
check("Workflow applies operations in sequence");
assert.throws(() => parseRange("0,6", 3));
assert.throws(() => parseRange("3-1", 3));
assert.throws(() => parseRange("oops", 3));
await assert.rejects(() =>
  processLocal(
    "merge-pdf",
    [{ ...source, bytes: new Uint8Array([1, 2, 3]) }],
    defaultOptions,
  ),
);
check("Malformed ranges and documents fail intentionally");
const filled = await PDFDocument.create();
const p = filled.addPage();
const f = filled.getForm().createTextField("Full name");
f.addToPage(p);
const fieldSource = { ...source, bytes: await filled.save() };
const filledOut = await processLocal("pdf-forms", [fieldSource], {
  ...defaultOptions,
  fields: { "Full name": "Test User" },
});
assert.equal(
  (await PDFDocument.load(filledOut.bytes))
    .getForm()
    .getTextField("Full name")
    .getText(),
  "Test User",
);
check("Interactive text fields retain entered values");
let response;
globalThis.self = globalThis;
globalThis.postMessage = (m) => {
  if (m.type === "result" || m.type === "error") response = m;
};
await import(pathToFileURL(`${process.cwd()}/${dir}/worker.mjs`).href);
const worker = async (payload) => {
  response = null;
  await globalThis.self.onmessage({ data: payload });
  if (response?.type === "error") throw Error(response.message);
  assert(response?.result);
  return response.result;
};
const sample = await worker({ tool: "sample" });
assert.equal((await PDFDocument.load(sample.bytes)).getPageCount(), 3);
check("Sample generation creates a real three-page PDF");
for (const [tool, path] of [
  ["pdf-to-word", "word/document.xml"],
  ["pdf-to-excel", "xl/worksheets/sheet1.xml"],
]) {
  const out = await worker({
    tool,
    textPages: [["Product  Quantity", "Widget  12"]],
    options: { name: "test" },
  });
  const z = await JSZip.loadAsync(out.bytes);
  assert(z.file(path));
  const xml = await z.file(path).async("string");
  assert(xml.length > 100);
}
check("DOCX and XLSX contain valid document packages");
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=";
const pptx = await worker({
  tool: "pdf-to-powerpoint",
  pages: [{ width: 400, height: 600, dataUrl: pixel }],
  options: { name: "test.pptx" },
});
const pptxZip = await JSZip.loadAsync(pptx.bytes);
assert(pptxZip.file("ppt/slides/slide1.xml"));
assert(Object.keys(pptxZip.files).some((p) => p.startsWith("ppt/media/image")));
check("PPTX contains a slide and its embedded image");
console.log(`Verified ${n} document behaviors.`);
