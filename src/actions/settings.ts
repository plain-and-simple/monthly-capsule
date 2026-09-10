"use server";

import { revalidatePath } from "next/cache";
import { validateSchedule } from "@/lib/schedule";
import { requireOwner } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type SettingsState = { error?: string; ok?: boolean } | null;

export async function updateSchedule(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const start = Number(formData.get("submit_start_day"));
  const end = Number(formData.get("submit_end_day"));
  const email = Number(formData.get("email_day"));

  await requireOwner(groupId);

  const invalid = validateSchedule(start, end, email);
  if (invalid) {
    return { error: invalid };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("groups")
    .update({
      submit_start_day: start,
      submit_end_day: end,
      email_day: email,
    })
    .eq("id", groupId);

  if (error) {
    return { error: "Could not save." };
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
  return { ok: true };
}

export async function updateGroupName(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length > 40) {
    return { error: "Name is too long." };
  }

  await requireOwner(groupId);

  const admin = createAdminClient();
  const { error } = await admin.from("groups").update({ name }).eq("id", groupId);
  if (error) {
    return { error: "Could not save." };
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
  revalidatePath(`/manage`);
  return { ok: true };
}
