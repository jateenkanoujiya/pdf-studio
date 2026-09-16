"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tools, getTool } from "@/lib/pdf/tools";
import { getCapabilities } from "@/app/actions/capabilities";
export function WebMCP() {
  const router = useRouter();
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "list_pdf_tools",
      description:
        "List PDF Studio tools, processing location, and actual availability.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const c = await getCapabilities();
        return tools.map((t) => ({
          id: t.id,
          name: t.name,
          available: c.tools.find((x) => x.id === t.id)?.available || false,
          limitation: t.note || null,
        }));
      },
    });
    register({
      name: "open_pdf_tool",
      description:
        "Navigate to a PDF tool workspace. Does not upload or process any documents.",
      inputSchema: {
        type: "object",
        properties: {
          toolId: { type: "string", enum: tools.map((t) => t.id) },
        },
        required: ["toolId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input: unknown) => {
        if (
          !input ||
          typeof input !== "object" ||
          !("toolId" in input) ||
          typeof input.toolId !== "string" ||
          !getTool(input.toolId)
        )
          throw Error("Choose a valid PDF tool ID.");
        const route = "/tools/" + input.toolId;
        router.push(route);
        return { navigationRequested: route };
      },
    });
    return () => lifecycle.abort();
  }, [router]);
  return null;
}
