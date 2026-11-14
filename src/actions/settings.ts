"use server";

import { revalidatePath } from "next/cache";
import { parseThemeFormValue } from "@/lib/capsule-theme";
import { closedYearMonthsFromRows, listGroupMonthRows } from "@/lib/compile";
import { CAPSULE_THEME_INVALID } from "@/lib/copy";
import {
  parseScheduleCatchUpForm,
  scheduleCatchUpPrompts,
  shouldSendCatchUpNow,
} from "@/lib/cycle-email";
import { loadCycleEmailSentMap, sendGroupCycleEmail } from "@/lib/cycle-mail";
import { parseScheduleForm, validateSchedule, type ScheduleDays } from "@/lib/schedule";
import { requireOwnerUncached } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type SettingsState =
  | ({ error?: string; ok?: boolean; notice?: string; capsule_theme?: string } & Partial<ScheduleDays>)
  | null;

export async function updateSchedule(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const days = parseScheduleForm(formData);
  const catchUp = parseScheduleCatchUpForm(formData);

  const { group } = await requireOwnerUncached(groupId);

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

  const updated = {
    ...group,
    submit_start_day: data.submit_start_day,
    submit_end_day: data.submit_end_day,
    email_day: data.email_day,
  };

  let notice: string | undefined;
  if (catchUp.sendOpen || catchUp.sendReminder) {
    const months = await listGroupMonthRows(groupId);
    const prompts = scheduleCatchUpPrompts({
      group: updated,
      closedYearMonths: closedYearMonthsFromRows(months),
      sent: await loadCycleEmailSentMap(groupId),
    });
    const sendOpen = shouldSendCatchUpNow(prompts.promptOpen, catchUp.sendOpen);
    const sendReminder = shouldSendCatchUpNow(prompts.promptReminder, catchUp.sendReminder);
    const failures: string[] = [];
    if (sendOpen && prompts.yearMonth) {
      const result = await sendGroupCycleEmail(updated, "open", prompts.yearMonth);
      if (result.reason === "resend-error" || (result.sent === 0 && result.error)) {
        failures.push(result.error || "Could not send the open email.");
      }
    }
    if (sendReminder && prompts.yearMonth) {
      const result = await sendGroupCycleEmail(updated, "reminder", prompts.yearMonth);
      if (result.reason === "resend-error" || (result.sent === 0 && result.error)) {
        failures.push(result.error || "Could not send the reminder.");
      }
    }
    if (failures.length > 0) {
      notice = `Saved the cycle, but the email did not send. ${failures.join(" ")}`;
    }
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
  return {
    ok: true,
    notice,
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

export async function updateCapsuleTheme(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const theme = parseThemeFormValue(formData.get("capsule_theme"));
  if (!theme) {
    return { error: CAPSULE_THEME_INVALID };
  }

  await requireOwnerUncached(groupId);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .update({ capsule_theme: theme })
    .eq("id", groupId)
    .select("capsule_theme")
    .maybeSingle();

  if (error || !data) {
    return { error: "Could not save.", capsule_theme: theme };
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
  return {
    ok: true,
    capsule_theme: parseThemeFormValue(data.capsule_theme) ?? theme,
  };
}
