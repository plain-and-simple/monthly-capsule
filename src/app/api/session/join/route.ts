import { respondSessionOpen } from "@/lib/session-redirect";
import { planJoinGroup } from "@/lib/session-open";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST form from Join: set group cookie on the response, then 303 GET /g/[uuid]. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    return respondSessionOpen(request, await planJoinGroup(form));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return respondSessionOpen(request, {
      ok: false,
      error: "Could not join.",
      path: "/join",
    });
  }
}
