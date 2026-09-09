"use server";

import { redirect } from "next/navigation";
import { listAccountGroups } from "@/lib/memberships";
import { requireAccount, setSession } from "@/lib/session";

export async function openManagedGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "");
  const account = await requireAccount();
  const groups = await listAccountGroups(account.id);
  const match = groups.find((row) => row.group.id === groupId);
  if (!match) {
    redirect("/manage");
  }
  await setSession({ memberId: match.member.id, groupId: match.group.id });
  redirect(`/g/${match.group.id}`);
}
