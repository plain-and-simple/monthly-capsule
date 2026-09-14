"use server";

import { redirect } from "next/navigation";
import { requireAccount, setSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export async function openManagedGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "");
  const account = await requireAccount();
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("id")
    .eq("account_id", account.id)
    .eq("group_id", groupId)
    .maybeSingle();
  if (!member) {
    redirect("/manage");
  }
  await setSession({ memberId: member.id as string, groupId });
  redirect(`/g/${groupId}`);
}
