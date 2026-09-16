import { getCapabilities } from "@/app/actions/capabilities";
export async function GET() {
  return Response.json(await getCapabilities(), {
    headers: { "Cache-Control": "no-store" },
  });
}
