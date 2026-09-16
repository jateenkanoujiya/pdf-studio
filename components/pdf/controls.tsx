"use client";
import { useRef, useState } from "react";
import { Eraser, Upload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { PDFOptions } from "@/lib/pdf/types";
export function Pick({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map(([v, n]) => (
            <SelectItem key={v} value={v}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export function Controls({
  tool,
  o,
  set,
  formFields,
}: {
  tool: string;
  o: PDFOptions;
  set: (p: Partial<PDFOptions>) => void;
  formFields: { name: string; type: string; value: string | boolean }[];
}) {
  const ranges = [
    "split-pdf",
    "extract-pages",
    "remove-pages",
    "rotate-pdf",
    "page-numbers",
    "watermark",
    "crop-pdf",
    "sign-pdf",
    "edit-pdf",
  ];
  const images = ["jpg-to-pdf", "png-to-pdf", "scan-to-pdf"];
  const marks = [
    "page-numbers",
    "watermark",
    "sign-pdf",
    "edit-pdf",
    "workflow",
  ];
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [sigMode, setSigMode] = useState("type");
  const imageUpload = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw Error("Choose an image under 5 MB.");
    set({ image: new Uint8Array(await file.arrayBuffer()) });
  };
  return (
    <>
      {tool === "merge-pdf" && (
        <p className="field-note">
          Files merge from top to bottom. Drag a file or use its arrow buttons
          to change the order.
        </p>
      )}
      {tool === "split-pdf" && (
        <Pick
          label="Split method"
          value={o.splitMode}
          choices={[
            ["range", "Extract a page range"],
            ["all", "Every page separately"],
            ["fixed", "Fixed-size groups"],
          ]}
          onChange={(splitMode) => set({ splitMode })}
        />
      )}
      {ranges.includes(tool) &&
        !(tool === "split-pdf" && o.splitMode !== "range") && (
          <label className="field-label">
            {tool === "remove-pages" ? "Pages to remove" : "Page range"}
            <input
              className="field"
              placeholder="All pages · e.g. 1, 3-5"
              value={o.range}
              onChange={(e) => set({ range: e.target.value })}
            />
            <span className="field-note">
              {tool === "remove-pages"
                ? "Enter the pages you want to delete."
                : "Leave blank to include all pages."}
            </span>
          </label>
        )}
      {tool === "split-pdf" && o.splitMode === "fixed" && (
        <label className="field-label">
          Pages per file
          <input
            className="field"
            type="number"
            min={1}
            max={1000}
            value={o.chunkSize}
            onChange={(e) => set({ chunkSize: +e.target.value })}
          />
        </label>
      )}
      {["rotate-pdf", "watermark", "workflow"].includes(tool) && (
        <Pick
          label={tool === "watermark" ? "Watermark angle" : "Rotation"}
          value={String(o.rotation)}
          choices={
            [
              ["0", "No rotation"],
              ["90", "90° clockwise"],
              ["180", "180° upside down"],
              ["270", "90° counterclockwise"],
              ["45", "45° watermark"],
            ].filter(([v]) => tool === "watermark" || v !== "45") as [
              string,
              string,
            ][]
          }
          onChange={(v) => set({ rotation: +v })}
        />
      )}
      {["watermark", "edit-pdf", "workflow"].includes(tool) && (
        <label className="field-label">
          {tool === "edit-pdf" ? "Text to add" : "Watermark text"}
          <input
            className="field"
            value={o.text}
            onChange={(e) => set({ text: e.target.value })}
            maxLength={120}
          />
          <span className="field-note">
            Basic Latin characters supported by the built-in font.
          </span>
        </label>
      )}
      {["watermark", "workflow"].includes(tool) && (
        <>
          <label className="field-label">
            Opacity{" "}
            <span className="muted">{Math.round(o.opacity * 100)}%</span>
            <input
              aria-label="Watermark opacity"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={o.opacity}
              onChange={(e) => set({ opacity: +e.target.value })}
            />
          </label>
          <label className="field-label">
            Or use an image
            <input
              className="field"
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={(e) => {
                void imageUpload(e.target.files?.[0]).catch((err) =>
                  alert(err.message),
                );
              }}
            />
          </label>
          {o.image && (
            <button
              className="text-btn"
              onClick={() => set({ image: undefined })}
            >
              Remove image and use text
            </button>
          )}
        </>
      )}
      {marks.includes(tool) && (
        <>
          <Pick
            label="Position"
            value={o.position}
            choices={[
              ["top-left", "Top left"],
              ["top-center", "Top center"],
              ["top-right", "Top right"],
              ["center", "Center"],
              ["bottom-left", "Bottom left"],
              ["bottom-center", "Bottom center"],
              ["bottom-right", "Bottom right"],
            ]}
            onChange={(position) => set({ position })}
          />
          <div className="field-grid">
            <label className="field-label">
              Text size (pt)
              <input
                type="number"
                min={8}
                max={144}
                className="field"
                value={o.fontSize}
                onChange={(e) => set({ fontSize: +e.target.value })}
              />
            </label>
            <label className="field-label">
              Margin (pt)
              <input
                type="number"
                min={0}
                max={150}
                className="field"
                value={o.margin}
                onChange={(e) => set({ margin: +e.target.value })}
              />
            </label>
          </div>
        </>
      )}
      {["page-numbers", "workflow"].includes(tool) && (
        <label className="field-label">
          Start numbering at
          <input
            className="field"
            type="number"
            min={0}
            max={10000}
            value={o.startIndex}
            onChange={(e) => set({ startIndex: +e.target.value })}
          />
        </label>
      )}
      {images.includes(tool) && (
        <>
          <Pick
            label="Page orientation"
            value={o.orientation}
            choices={[
              ["portrait", "Portrait · A4"],
              ["landscape", "Landscape · A4"],
            ]}
            onChange={(orientation) => set({ orientation })}
          />
          <Pick
            label="Images per page"
            value={String(o.grid)}
            choices={[
              ["1", "1 image"],
              ["2", "2 images"],
              ["4", "4 images"],
            ]}
            onChange={(v) => set({ grid: +v })}
          />
          <Pick
            label="Margins"
            value={String(o.margin)}
            choices={[
              ["0", "No margin"],
              ["18", "Small · ¼ inch"],
              ["36", "Standard · ½ inch"],
              ["72", "Wide · 1 inch"],
            ]}
            onChange={(v) => set({ margin: +v })}
          />
        </>
      )}
      {tool === "compress-pdf" && (
        <>
          <div
            className="compression-tiers"
            role="radiogroup"
            aria-label="Compression quality"
          >
            {[
              {
                id: "extreme",
                title: "Extreme",
                note: "Smallest size · reduced detail",
              },
              {
                id: "recommended",
                title: "Recommended",
                note: "A balance of size and clarity",
              },
              {
                id: "low",
                title: "Low compression",
                note: "Sharper pages · larger output",
              },
            ].map((t) => (
              <button
                role="radio"
                aria-checked={o.compression === t.id}
                key={t.id}
                className={
                  "compression-tier " +
                  (o.compression === t.id ? "selected" : "")
                }
                onClick={() => set({ compression: t.id })}
              >
                <span className="radio-dot" />
                <span>
                  <strong>{t.title}</strong>
                  <small>{t.note}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="field-note">
            Image-based compression. Pages are rasterized, so searchable text,
            form fields, and links are removed. Actual size savings are measured
            after processing.
          </p>
        </>
      )}
      {["crop-pdf", "redact-pdf"].includes(tool) && (
        <>
          <p className="field-note">
            Drag the selection on the preview. Drag its corner to resize. The
            same relative area applies to each selected page.
          </p>
          <div className="field-grid">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label className="field-label" key={key}>
                {key === "x"
                  ? "Left"
                  : key === "y"
                    ? "Top"
                    : key[0].toUpperCase() + key.slice(1)}{" "}
                (%)
                <input
                  className="field"
                  type="number"
                  min={key === "width" || key === "height" ? 1 : 0}
                  max={100}
                  value={Math.round(o.crop[key])}
                  onChange={(e) => {
                    const c = {
                      ...o.crop,
                      [key]: Math.max(0, Math.min(100, +e.target.value)),
                    };
                    c.width = Math.max(1, Math.min(c.width, 100 - c.x));
                    c.height = Math.max(1, Math.min(c.height, 100 - c.y));
                    c.x = Math.min(c.x, 99);
                    c.y = Math.min(c.y, 99);
                    set({ crop: c });
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {tool === "sign-pdf" && (
        <Tabs
          className="signature-tabs"
          value={sigMode}
          onValueChange={(v) => {
            setSigMode(v);
            set({ image: undefined, signature: "" });
          }}
        >
          <TabsList>
            <TabsTrigger value="type">Type</TabsTrigger>
            <TabsTrigger value="draw">Draw</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>
          <TabsContent value="type">
            <label className="field-label">
              Your signature
              <input
                className="field"
                value={o.signature || ""}
                placeholder="Your full name"
                onChange={(e) => set({ signature: e.target.value })}
              />
            </label>
          </TabsContent>
          <TabsContent value="draw">
            <canvas
              ref={signatureCanvas}
              width={520}
              height={240}
              className="signature-canvas"
              aria-label="Draw your signature"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                const r = e.currentTarget.getBoundingClientRect();
                const ctx = e.currentTarget.getContext("2d")!;
                ctx.strokeStyle = "#1f2430";
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(
                  ((e.clientX - r.left) * 520) / r.width,
                  ((e.clientY - r.top) * 240) / r.height,
                );
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                const ctx = e.currentTarget.getContext("2d")!;
                ctx.lineTo(
                  ((e.clientX - r.left) * 520) / r.width,
                  ((e.clientY - r.top) * 240) / r.height,
                );
                ctx.stroke();
              }}
              onPointerUp={() => {
                drawing.current = false;
                signatureCanvas.current?.toBlob(async (b) => {
                  if (b) set({ image: new Uint8Array(await b.arrayBuffer()) });
                });
              }}
            />
            <button
              className="text-btn"
              onClick={() => {
                signatureCanvas.current
                  ?.getContext("2d")
                  ?.clearRect(0, 0, 520, 240);
                set({ image: undefined });
              }}
            >
              <Eraser size={13} />
              Clear signature
            </button>
          </TabsContent>
          <TabsContent value="upload">
            <label className="field-label">
              Signature image
              <input
                className="field"
                type="file"
                accept=".png,.jpg,.jpeg"
                onChange={(e) => {
                  void imageUpload(e.target.files?.[0]).catch((err) =>
                    alert(err.message),
                  );
                }}
              />
            </label>
          </TabsContent>
        </Tabs>
      )}
      {tool === "pdf-forms" && (
        <div className="form-fields">
          {!formFields.length && (
            <p className="field-note">
              Select a PDF with existing text fields or checkboxes. Available
              fields will appear here.
            </p>
          )}
          {formFields.map((f) =>
            f.type === "checkbox" ? (
              <label key={f.name} className="form-check">
                <Checkbox
                  checked={Boolean(o.fields?.[f.name] ?? f.value)}
                  onCheckedChange={(v) =>
                    set({ fields: { ...o.fields, [f.name]: v === true } })
                  }
                />
                {f.name}
              </label>
            ) : (
              <label key={f.name} className="field-label">
                {f.name}
                <input
                  className="field"
                  value={String(o.fields?.[f.name] ?? f.value)}
                  onChange={(e) =>
                    set({ fields: { ...o.fields, [f.name]: e.target.value } })
                  }
                />
              </label>
            ),
          )}
        </div>
      )}
      {tool === "organize-pdf" && (
        <p className="field-note">
          Drag pages to reorder them. Use the buttons below a page to rotate,
          move, or remove it. Changes apply when you export.
        </p>
      )}
      {["pdf-to-jpg", "pdf-to-png"].includes(tool) && (
        <p className="field-note">
          Export full pages at 108 DPI. Multiple pages arrive in a ZIP.
          Embedded-image extraction is planned.
        </p>
      )}
      {["unlock-pdf", "protect-pdf"].includes(tool) && (
        <label className="field-label">
          {tool === "protect-pdf" ? "New password" : "Current password"}
          <input
            type="password"
            autoComplete="off"
            className="field"
            value={o.password || ""}
            onChange={(e) => set({ password: e.target.value })}
          />
        </label>
      )}
    </>
  );
}
