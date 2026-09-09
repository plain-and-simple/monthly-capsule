import { redirect } from "next/navigation";
import { listAccountGroups } from "@/lib/memberships";
import { requireAccount, setSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Route Handler: set the group session when the account has exactly one group. */
export async function GET() {
  const account = await requireAccount();
  const groups = await listAccountGroups(account.id);
  if (groups.length !== 1) {
    redirect("/manage");
  }

  const membership = groups[0]!;
  await setSession({
    memberId: membership.member.id,
    groupId: membership.group.id,
  });
  redirect(`/g/${membership.group.id}`);
}
