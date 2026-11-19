import { seeOtherWithCookies } from "@/lib/session-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Route Handler: expire a stale account cookie and its group cookie, then 303. */
export async function GET(request: Request) {
  return seeOtherWithCookies(request, "/", { clearAccount: true, clearSession: true });
}
