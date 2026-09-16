import { cp, mkdir, readdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const pdf = dirname(require.resolve("pdfjs-dist/package.json"));
await mkdir("public/engines/pdfjs", { recursive: true });
await copyFile(
  join(pdf, "build/pdf.worker.min.mjs"),
  "public/engines/pdfjs/pdf.worker.min.mjs",
);
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  await cp(join(pdf, dir), "public/engines/pdfjs/" + dir, { recursive: true });
const tess = dirname(require.resolve("tesseract.js/package.json"));
const tessRequire = createRequire(join(tess, "package.json"));
const core = dirname(tessRequire.resolve("tesseract.js-core/package.json"));
await mkdir("public/engines/tesseract/core", { recursive: true });
await copyFile(
  join(tess, "dist/worker.min.js"),
  "public/engines/tesseract/worker.min.js",
);
for (const file of await readdir(core))
  if (file.endsWith(".wasm.js") || file.endsWith(".wasm") || file === "LICENSE")
    await copyFile(join(core, file), "public/engines/tesseract/core/" + file);
console.log("PDF rendering and OCR runtime assets prepared.");
