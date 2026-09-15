import { seeOtherWithCookies } from "@/lib/session-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST form from Sign out: expire both cookies on the response, then 303 GET /. */
export async function POST(request: Request) {
  return seeOtherWithCookies(request, "/", { clearAccount: true, clearSession: true });
}
