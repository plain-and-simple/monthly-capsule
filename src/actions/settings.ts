"use server";

import { revalidatePath } from "next/cache";
import { parseScheduleForm, validateSchedule, type ScheduleDays } from "@/lib/schedule";
import { requireOwnerUncached } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type SettingsState =
  | ({ error?: string; ok?: boolean } & Partial<ScheduleDays>)
  | null;

export async function updateSchedule(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const days = parseScheduleForm(formData);

  await requireOwnerUncached(groupId);

  const invalid = validateSchedule(days.submit_start_day, days.submit_end_day, days.email_day);
  if (invalid) {
    return { error: invalid, ...days };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .update({
      submit_start_day: days.submit_start_day,
      submit_end_day: days.submit_end_day,
      email_day: days.email_day,
    })
    .eq("id", groupId)
    .select("submit_start_day, submit_end_day, email_day")
    .maybeSingle();

  if (error || !data) {
    return { error: "Could not save.", ...days };
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
  return {
    ok: true,
    submit_start_day: data.submit_start_day,
    submit_end_day: data.submit_end_day,
    email_day: data.email_day,
  };
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

  await requireOwnerUncached(groupId);

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
