export type PDFOptions = {
  range: string;
  splitMode: string;
  chunkSize: number;
  rotation: number;
  text: string;
  fontSize: number;
  opacity: number;
  position: string;
  startIndex: number;
  margin: number;
  orientation: string;
  grid: number;
  compression: string;
  crop: { x: number; y: number; width: number; height: number };
  pageOrder?: { index: number; rotation: number }[];
  image?: Uint8Array;
  password?: string;
  signature?: string;
  fields?: Record<string, string | boolean>;
  steps?: string[];
};
export const defaultOptions: PDFOptions = {
  range: "",
  splitMode: "range",
  chunkSize: 1,
  rotation: 90,
  text: "CONFIDENTIAL",
  fontSize: 24,
  opacity: 0.3,
  position: "center",
  startIndex: 1,
  margin: 36,
  orientation: "portrait",
  grid: 1,
  compression: "recommended",
  crop: { x: 10, y: 10, width: 80, height: 80 },
};
export const formatBytes = (n: number) =>
  n >= 1048576
    ? (n / 1048576).toFixed(1) + " MB"
    : n >= 1024
      ? Math.round(n / 1024) + " KB"
      : n + " B";
export type Output = { bytes: Uint8Array; name: string; type: string };
export function parseRange(input: string, count: number): number[] {
  if (!input.trim()) return Array.from({ length: count }, (_, i) => i);
  const pages: number[] = [];
  for (const part of input.split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw Error("Use page numbers like 1, 3-5.");
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b > count || a > b)
      throw Error(
        `Page ranges must be between 1 and ${count}, in ascending order.`,
      );
    for (let p = a; p <= b; p++) if (!pages.includes(p - 1)) pages.push(p - 1);
  }
  return pages;
}
