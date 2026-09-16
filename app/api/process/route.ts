import { getTool } from "@/lib/pdf/tools";
import { getCapabilities } from "@/app/actions/capabilities";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return Response.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  const limit = 25 * 1024 * 1024;
  const size = Number(request.headers.get("content-length") || 0);
  if (size > limit)
    return Response.json(
      { error: "Files must total less than 25 MB." },
      { status: 413 },
    );
  if (!request.headers.get("content-type")?.includes("multipart/form-data"))
    return Response.json(
      { error: "Expected a document upload." },
      { status: 415 },
    );
  // Bound the stream before parsing so a missing Content-Length cannot bypass the limit.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "No document received." }, { status: 400 });
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return Response.json(
        { error: "Files must total less than 25 MB." },
        { status: 413 },
      );
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    return Response.json(
      { error: "The upload could not be read." },
      { status: 400 },
    );
  }
  const operation = String(form.get("tool") || "");
  const tool = getTool(operation);
  if (!tool || tool.engine !== "service")
    return Response.json(
      { error: "Unsupported server operation." },
      { status: 400 },
    );
  const capabilities = await getCapabilities();
  if (!capabilities.tools.find((t) => t.id === operation)?.available)
    return Response.json(
      { error: "This processing service is not connected yet." },
      { status: 503 },
    );
  const files = form.getAll("files");
  if (
    !files.length ||
    files.some((f) => !(f instanceof File) || !f.size || f.size > limit)
  )
    return Response.json(
      { error: "A valid document is required." },
      { status: 400 },
    );
  const endpoint = process.env.PDF_PROCESSOR_URL!;
  if (!endpoint.startsWith("https://"))
    return Response.json(
      { error: "The document processor must use HTTPS." },
      { status: 503 },
    );
  try {
    const response = await fetch(endpoint.replace(/\/$/, "") + "/process", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.PDF_PROCESSOR_TOKEN },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok)
      return Response.json(
        {
          error:
            "The document processor could not complete this task. Check the file and try again.",
        },
        { status: 502 },
      );
    return new Response(response.body, {
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/pdf",
        "Content-Disposition":
          response.headers.get("Content-Disposition") ||
          'attachment; filename="processed-document.pdf"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      {
        error: "The document processor is unavailable. Please try again later.",
      },
      { status: 502 },
    );
  }
}
