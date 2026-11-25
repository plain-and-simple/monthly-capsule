"use server";

import { revalidatePath } from "next/cache";
import { closedYearMonthsFromRows, listGroupMonthRows } from "@/lib/compile";
import {
  SLACK_AWARDS_FAILED,
  SLACK_AWARDS_REPLACE_NEEDED,
  SLACK_AWARDS_REFRESHED,
} from "@/lib/copy";
import { forceCloseYearMonth } from "@/lib/cycle";
import { parseSlackAwardsForm, slackHistoryYearMonth, slackRefreshAllowed } from "@/lib/slack-awards";
import { generateSlackAwardsForGroup } from "@/lib/slack-awards-job";
import { readSlackAwardsRow, setSlackAwardsEnabled, writeOwnerSlackAwards } from "@/lib/slack-awards-store";
import { requireOwnerUncached } from "@/lib/session";

export type SlackAwardsState = { error?: string; ok?: boolean; notice?: string } | null;

async function draftAwardsYearMonth(groupId: string) {
  const { group } = await requireOwnerUncached(groupId);
  const months = await listGroupMonthRows(groupId);
  const cycleYearMonth = forceCloseYearMonth(group, closedYearMonthsFromRows(months));
  return { group, yearMonth: slackHistoryYearMonth(cycleYearMonth) };
}

function revalidateGroup(groupId: string) {
  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
}

export async function updateSlackAwardsEnabled(
  _prev: SlackAwardsState,
  formData: FormData,
): Promise<SlackAwardsState> {
  const groupId = String(formData.get("groupId") ?? "");
  await requireOwnerUncached(groupId);
  const enabled = String(formData.get("slack_awards_enabled") ?? "") === "1";
  try {
    await setSlackAwardsEnabled(groupId, enabled);
  } catch {
    return { error: "Could not save." };
  }
  revalidateGroup(groupId);
  return { ok: true };
}

export async function saveSlackAwardsDraft(
  _prev: SlackAwardsState,
  formData: FormData,
): Promise<SlackAwardsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const { yearMonth } = await draftAwardsYearMonth(groupId);
  if (String(formData.get("year_month") ?? "") !== yearMonth) {
    return { error: "Could not save." };
  }
  const parsed = parseSlackAwardsForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  try {
    await writeOwnerSlackAwards({
      groupId,
      yearMonth,
      data: parsed.data,
      hidden: String(formData.get("hidden") ?? "") === "1",
    });
  } catch {
    return { error: "Could not save." };
  }
  revalidateGroup(groupId);
  return { ok: true };
}

export async function refreshSlackAwards(
  _prev: SlackAwardsState,
  formData: FormData,
): Promise<SlackAwardsState> {
  const groupId = String(formData.get("groupId") ?? "");
  const { group, yearMonth } = await draftAwardsYearMonth(groupId);
  if (group.slack_awards_enabled !== true) {
    return { error: SLACK_AWARDS_FAILED };
  }
  if (String(formData.get("year_month") ?? "") !== yearMonth) {
    return { error: SLACK_AWARDS_FAILED };
  }
  const existing = await readSlackAwardsRow(groupId, yearMonth);
  const confirmed = String(formData.get("confirm_replace") ?? "") === "1";
  if (!slackRefreshAllowed(existing?.owner_edited === true, confirmed)) {
    return { error: SLACK_AWARDS_REPLACE_NEEDED };
  }
  const result = await generateSlackAwardsForGroup({ groupId, yearMonth, force: true });
  if (result !== "saved") return { error: SLACK_AWARDS_FAILED };
  revalidateGroup(groupId);
  return { ok: true, notice: SLACK_AWARDS_REFRESHED };
}
