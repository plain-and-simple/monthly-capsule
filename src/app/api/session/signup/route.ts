import { respondSessionOpen } from "@/lib/session-redirect";
import { planSignUp } from "@/lib/session-open";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST form from landing / join gate: set account cookie on the response, then 303. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    return respondSessionOpen(request, await planSignUp(form));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return respondSessionOpen(request, {
      ok: false,
      error: "Could not create account.",
      path: "/",
    });
  }
}
