# PDF Studio

An independent, original PDF workspace inspired by iLovePDF's tool coverage. This is the **foundation release**, not a claim of complete iLovePDF parity or production certification.

## Start locally

Requires Node 22.13+ and pnpm 11.25.0 (see packageManager).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm prepare:pdf
pnpm dev:next
```

Open http://localhost:3000. For a standard Next.js production build use `pnpm build:next` followed by `pnpm start:next`. Next.js 16 App Router, React 19, Tailwind 4, Framer Motion, Radix/shadcn and Lucide are used in application source. The hosted Sites deployment uses the bundled Vinext compatibility runtime to run this App Router source on Cloudflare Workers (`pnpm build`). The two build modes are intentionally separate.

## Project structure

```text
app/
  layout.tsx                     Theme/global state, metadata, agent hooks
  page.tsx                       Tool dashboard
  tools/[slug]/page.tsx           Individual tool workspaces
  actions/capabilities.ts         Server Action exposing availability only
  api/capabilities/route.ts       Read-only capability contract
  api/process/route.ts            Bounded server-side processing proxy
components/pdf/
  dashboard.tsx                  Search, filters, favorites, activity, workflows
  shell.tsx                      Sidebar, command palette, theme and navigation
  workspace.tsx                  Uploads, previews, controls, progress, results
  controls.tsx                   Contextual options, signature canvas, form fields
  store.tsx                      React context; local preferences and metadata
  webmcp.tsx                     Progressive agent navigation hooks
lib/pdf/
  tools.ts                       Complete registry and per-tool limitations
  types.ts                       Shared contracts and range validation
  engine.ts                      Deterministic PDF transformations
  client.ts                      Worker lifecycle and PDF.js rendering pipeline
workers/pdf.worker.ts            PDF, ZIP, document export and difference engines
scripts/prepare-pdf-assets.mjs    Self-host PDF.js and OCR runtime assets
scripts/verify-pdf.mjs            Functional document-output smoke tests
```

## Working in this release

- Merge files with drag or keyboard/button ordering.
- Split by range, every page, or fixed-size groups; ZIP for multiple outputs.
- Remove/extract pages; organize up to 80 pages with rotation and drag/button ordering.
- JPEG/PNG to A4 PDF, portrait/landscape, 1/2/4-image layouts and margins; camera capture on supported phones.
- Page rotation, text annotations, text/image watermarks, page numbers and text/drawn/image electronic signatures.
- Fill existing text fields and checkboxes.
- Visual crop selection with percentage inputs. Cropping changes page boundaries; it does not securely delete hidden content.
- PDF page export to JPG/PNG; editable text to DOCX, text rows to XLSX, page images to PPTX, plain text to Markdown.
- Image-based compression with three quality tiers and actual post-process savings. Rasterization removes selectable text, forms, and links.
- Raster redaction. Selected pixels are burned out and the file is rebuilt from page images; original objects are not copied.
- Side-by-side comparison and per-page changed-pixel highlighting. Missing pages appear blank. This is a pixel comparison, not a semantic document diff.
- English OCR via Tesseract's Web Worker and positioned invisible text. The English model downloads on first use; network access is needed then. This path has not been browser-validated in this environment.
- Saved local workflows for rotate, number, and watermark; local favorites and activity metadata.
- Search-as-you-type, Ctrl/Cmd+K command palette, dark/light themes, mobile layout, reduced-motion support, progress, cancellation and download states.

PDF-lib transforms, merge, ZIP, DOCX/XLSX/PPTX serialization and image-difference loops run in a dedicated worker. PDF.js parses in its own worker and paints browser canvases asynchronously. Canvas paint/serialization orchestration is on the browser thread. OCR runs in Tesseract's dedicated worker. Output object URLs are revoked when replaced or on teardown.

Limits: 25 MB combined input, 50 files, 80-page organization, and 100 pages for image/text conversion. Complex pages can still require substantial memory. Built-in PDF text annotations and OCR text layers currently use basic Latin glyphs. Cropping rejects pages with an existing rotation; normalize their rotation first. Reordering/merging signed or form-bearing PDFs can invalidate signatures and document-level field relationships; use unsigned flattened PDFs for those operations.

## Present in the registry; service connection required

Word/PowerPoint/Excel/HTML to PDF, known-password unlock, AES-256 protect, structural repair, PDF/A, AI summarization and PDF translation intentionally cannot pretend to succeed without a processor. Configure all three environment variables in `.env.example` to enable only the implemented operations on your service. In Sites, set these as private runtime values.

The proxy accepts multipart fields `tool`, `options` (JSON), and `files`. It forwards to `PDF_PROCESSOR_URL/process` with a bearer credential and expects a binary response plus Content-Type/Content-Disposition. It checks same-origin requests, bounds the body before parsing, times out upstream requests, blocks redirects, and requires HTTPS. It never sends the processor secret to the client. A production service must independently authenticate, validate file structure, sandbox native converters, enforce concurrency/rate/CPU/memory quotas, clean temporary files, and validate PDF/A output. Use native tools such as LibreOffice/qpdf/Ghostscript in an isolated service, not inside the Cloudflare isolate. Add a durable job queue before enabling long-running workloads at scale.

## Parity backlog (explicitly not complete)

- Layout-preserving editable Word/PowerPoint conversion, accurate table reconstruction, and embedded-image extraction.
- Existing-text editing, freehand/shape annotation, custom font choice and fully live annotation previews.
- Certificate-based digital signing, multi-recipient signature requests and audit trails.
- Form creation, automatic field detection, lists and radio groups.
- URL-to-PDF capture with SSRF-safe browser isolation; HTML upload route is the current adapter contract.
- Standards-validated PDF/A conversion, advanced repair and AES-256 execution in the separate processor.
- Production multilingual OCR assets/fonts, language selection and recognition-quality evaluation.
- AI provider integration for summary/translation, cross-device scanning, native desktop/mobile apps, cloud storage integrations, team administration and subscriptions.

No service processing, AI output, cryptographic signature, ISO compliance, or full-platform parity is simulated. See each tool's workspace notice before processing files.

## Verification

`pnpm typecheck` checks application types. `node scripts/verify-pdf.mjs` constructs real PDFs and checks merge, split, extraction, removal, rotation, crop, watermark, numbering, workflow, malformed-input rejection and conversion package structure. It does not replace browser accessibility, performance, visual regression, OCR quality or security validation. WebMCP hooks are feature detected; runtime validation requires a supported browser context.

The managed hosted build also runs `node scripts/verify-worker-build.mjs`. This checks the emitted worker URL resolves to the site's HTTPS origin and an existing asset, then starts that exact bundle in a Node worker harness to verify merging and compression's raster-to-PDF step. It does not test browser canvas rendering. Vite uses its `?worker` import through a scoped module alias; standard Next.js keeps its native worker entry syntax.
