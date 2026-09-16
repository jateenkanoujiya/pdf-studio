/// <reference types="vite/client" />
import PDFWorker from "../../workers/pdf.worker.ts?worker";

// Vite's worker import emits a same-origin asset URL without import.meta.url.
// This avoids Vinext rewriting the browser URL's base to a file:// source URL.
export function createPDFWorker(): Worker {
  return new PDFWorker();
}
