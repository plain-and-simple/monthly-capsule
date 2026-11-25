import "server-only";

import { reportOpsAlert } from "@/lib/ops-alert-mail";
import { pullSlackAwardsDraft, runSlackAwardsForGroups, maskSlackOpsDetail } from "@/lib/slack-awards";
import { collectSlackAwards, requireSlackBotToken } from "@/lib/slack-client";
import {
  readSlackAwardsRow,
  writeForcedSlackAwards,
  writeGeneratedSlackAwards,
} from "@/lib/slack-awards-store";
import { createAdminClient } from "@/lib/supabase";
import type { Group } from "@/lib/types";

async function alertSlackFailure(groupId: string | null, error: unknown): Promise<void> {
  const detail = maskSlackOpsDetail(error);
  console.error("slack awards skipped", { groupId, detail });
  const code = detail === "slack_token_missing" ? "slack_token_missing" : "slack_awards_failed";
  await reportOpsAlert({
    route: "slack-awards",
    code,
    groupId,
    memberId: null,
  });
}

/**
 * Fill one month's draft from Slack. `yearMonth` is the calendar month the messages cover.
 * Skips rows the owner has edited unless force is set.
 * Returns "failed" instead of throwing when Slack or the token is unavailable.
 */
export async function generateSlackAwardsForGroup(input: {
  groupId: string;
  yearMonth: string;
  force: boolean;
}): Promise<"saved" | "skipped" | "failed"> {
  try {
    return await pullSlackAwardsDraft({
      groupId: input.groupId,
      yearMonth: input.yearMonth,
      force: input.force,
      read: readSlackAwardsRow,
      collect: async (yearMonth) => {
        const token = requireSlackBotToken();
        return collectSlackAwards({
          token,
          writingMonth: yearMonth,
        });
      },
      writeGenerated: (row) => writeGeneratedSlackAwards(row),
      writeForced: (row) => writeForcedSlackAwards(row),
    });
  } catch (error) {
    await alertSlackFailure(input.groupId, error);
    return "failed";
  }
}

/**
 * Previous Chicago month for every group that opted in, unless a manual run names a month or one group.
 * Always force=false, so an owner-edited row is skipped. Does not change slack_awards_enabled.
 * One group's failure does not stop the next.
 */
export async function refreshMonthlySlackAwards(
  now: Date = new Date(),
  options?: { yearMonth?: string | null; groupId?: string | null },
) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");
  return runSlackAwardsForGroups({
    groups: (groups ?? []) as Group[],
    now,
    yearMonth: options?.yearMonth,
    groupId: options?.groupId,
    generate: (groupId, yearMonth) => generateSlackAwardsForGroup({ groupId, yearMonth, force: false }),
  });
}
