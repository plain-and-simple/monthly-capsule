import { capsulePdfResponse } from "@/lib/capsule-pdf-response";
import { parseCapsuleEditionParam } from "@/lib/month-version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string; yearMonth: string; edition: string }> },
) {
  const { uuid, yearMonth, edition } = await context.params;
  const version = parseCapsuleEditionParam(edition);
  if (version == null) {
    return new Response("Not found", { status: 404 });
  }
  return capsulePdfResponse({ uuid, yearMonth, version });
}
