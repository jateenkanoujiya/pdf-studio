import { notFound } from "next/navigation";
import { getTool } from "@/lib/pdf/tools";
import { Workspace } from "@/components/pdf/workspace";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: getTool(slug)?.name || "Workflow" };
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!getTool(slug) && slug !== "workflow") notFound();
  return <Workspace toolId={slug} />;
}
