import { seeOtherWithCookies } from "@/lib/session-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Route Handler: expire a stale or invalid account cookie on the response, then 303. */
export async function GET(request: Request) {
  return seeOtherWithCookies(request, "/", { clearAccount: true });
}
