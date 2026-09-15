import { listAccountGroups } from "@/lib/memberships";
import { mintSessionToken, requireAccount } from "@/lib/session";
import { seeOther, seeOtherWithCookies } from "@/lib/session-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Route Handler: set the group session when the account has exactly one group. */
export async function GET(request: Request) {
  const account = await requireAccount();
  const groups = await listAccountGroups(account.id);
  if (groups.length !== 1) {
    return seeOther(request, "/manage");
  }

  const membership = groups[0]!;
  const token = await mintSessionToken({
    memberId: membership.member.id,
    groupId: membership.group.id,
  });
  return seeOtherWithCookies(request, `/g/${membership.group.id}`, { session: token });
}
