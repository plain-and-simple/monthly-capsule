import { SIGNED_OUT_PATH } from "@/lib/session-policy";
import { seeOtherWithCookies } from "@/lib/session-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST form from Sign out: expire both cookies on the response, then 303 GET landing. */
export async function POST(request: Request) {
  return seeOtherWithCookies(request, SIGNED_OUT_PATH, { clearAccount: true, clearSession: true });
}
