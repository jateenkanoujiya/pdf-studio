// Validate emitted URLs and execute the shipped worker bundle, rather than a
// transpiled source substitute. This is not a browser rendering/UI test.
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";

const root = path.resolve(process.argv[2] || "dist/client");
const origin = "https://pdf-studio.example";
const constructors = [];
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (entry.name.endsWith(".js")) {
      const code = await readFile(file, "utf8");
      if (!code.includes("pdf.worker-")) continue;
      const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isNewExpression(node) && node.expression.getText(source) === "Worker") {
          const argument = node.arguments?.[0]?.getText(source);
          if (argument?.includes("pdf.worker-")) constructors.push(argument);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
await inspect(path.join(root, "_next", "static"));
assert(constructors.length, "No PDF worker constructor found in the browser bundle");
const assets = new Set();
for (const argument of constructors) {
  const value = runInNewContext(argument, { URL }, { timeout: 1000 });
  // Resolve relative addresses the same way a page on a nested tool route does.
  const url = new URL(String(value), origin + "/tools/merge-pdf");
  assert.equal(url.origin, origin, `Worker must be same-origin: ${url.href}`);
  const asset = path.join(root, url.pathname);
  assert((await stat(asset)).isFile(), `Missing emitted worker: ${url.pathname}`);
  assets.add(asset);
}
console.log("PASS Published worker URL resolves to the site's HTTPS origin and an emitted asset");

const input = await PDFDocument.create();
input.addPage([300, 400]);
const bytes = await input.save();
const jpeg = new Uint8Array(await readFile(new URL("./fixtures/worker-page.jpg", import.meta.url)));

for (const asset of assets) {
  const bootstrap = `
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.self = globalThis;
    globalThis.postMessage = message => parentPort.postMessage(message);
    parentPort.on('message', data => globalThis.onmessage({ data }));
    import(workerData).then(() => parentPort.postMessage({ type: 'ready' }));
  `;
  const worker = new Worker(bootstrap, { eval: true, workerData: pathToFileURL(asset).href });
  function waitForResult(ready = false) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Published worker timed out")), 20000);
      function finish(error, value) {
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
        error ? reject(error) : resolve(value);
      }
      const onError = error => finish(error);
      const onMessage = message => {
        if (message.type === "error") finish(new Error(message.message));
        else if (message.type === (ready ? "ready" : "result")) finish(null, message.result);
      };
      worker.on("message", onMessage);
      worker.on("error", onError);
    });
  }
  try {
    await waitForResult(true);
    let result = waitForResult();
    worker.postMessage({
      tool: "merge-pdf",
      sources: [1, 2].map(i => ({ name: `input-${i}.pdf`, bytes, type: "application/pdf" })),
      options: {},
    });
    const merged = await PDFDocument.load((await result).bytes);
    assert.equal(merged.getPageCount(), 2);
    console.log("PASS Published worker starts and merges two PDFs");

    result = waitForResult();
    worker.postMessage({
      tool: "raster-pdf",
      pages: [1, 2].map(() => ({ width: 300, height: 400, bytes: jpeg })),
      options: { name: "compressed.pdf" },
    });
    const compressed = await result;
    assert.equal(compressed.name, "compressed.pdf");
    const rebuilt = await PDFDocument.load(compressed.bytes);
    assert.equal(rebuilt.getPageCount(), 2);
    assert.deepEqual(rebuilt.getPage(0).getSize(), { width: 300, height: 400 });
    assert(rebuilt.getPage(0).node.Resources().toString().includes("/XObject"));
    console.log("PASS Published worker completes compression's raster-to-PDF step");
  } finally {
    await worker.terminate();
  }
}
