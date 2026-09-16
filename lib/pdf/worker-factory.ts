// Next.js recognizes this literal worker entry and emits a hashed browser asset.
// The Sites/Vite build aliases this module to worker-factory.vite.ts.
export function createPDFWorker(): Worker {
  return new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), {
    type: "module",
  });
}
