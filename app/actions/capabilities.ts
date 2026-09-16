"use server";
import { tools } from "@/lib/pdf/tools";
export async function getCapabilities() {
  const configured = Boolean(
    process.env.PDF_PROCESSOR_URL && process.env.PDF_PROCESSOR_TOKEN,
  );
  const enabled = (process.env.PDF_PROCESSOR_TOOLS || "")
    .split(",")
    .map((s) => s.trim());
  return {
    serviceConfigured: configured,
    tools: tools.map((t) => ({
      id: t.id,
      available:
        t.engine !== "service" || (configured && enabled.includes(t.id)),
      engine: t.engine,
    })),
  };
}
