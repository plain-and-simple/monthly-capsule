import { capsulePdfResponse } from "@/lib/capsule-pdf-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string; yearMonth: string }> },
) {
  const { uuid, yearMonth } = await context.params;
  return capsulePdfResponse({ uuid, yearMonth });
}
