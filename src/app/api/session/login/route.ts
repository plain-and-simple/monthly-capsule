import { LOGIN_WRONG } from "@/lib/account";
import { respondSessionOpen } from "@/lib/session-redirect";
import { planManageLogin } from "@/lib/session-open";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST form from landing / join gate: set account cookie on the response, then 303. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    return respondSessionOpen(request, await planManageLogin(form));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return respondSessionOpen(request, {
      ok: false,
      error: LOGIN_WRONG,
      path: "/",
    });
  }
}
