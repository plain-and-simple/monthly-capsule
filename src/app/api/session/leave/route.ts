import { getAccount } from "@/lib/session";
import { seeOtherWithCookies } from "@/lib/session-redirect";
import { planLeave } from "@/lib/session-open";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST: drop the group cookie on the response, then 303 to Manage or home. */
export async function POST(request: Request) {
  const account = await getAccount();
  const decision = planLeave(Boolean(account));
  return seeOtherWithCookies(request, decision.path, { clearSession: true });
}