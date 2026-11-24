import "server-only";

import { reportOpsAlert } from "@/lib/ops-alert-mail";
import { slackHistoryYearMonth, runSlackAwardsForGroups, maskSlackOpsDetail } from "@/lib/slack-awards";
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
 * Fill one cycle's draft from Slack. Skips rows the owner has edited unless force is set.
 * Returns "failed" instead of throwing when Slack or the token is unavailable.
 */
export async function generateSlackAwardsForGroup(input: {
  groupId: string;
  yearMonth: string;
  force: boolean;
}): Promise<"saved" | "skipped" | "failed"> {
  try {
    const existing = await readSlackAwardsRow(input.groupId, input.yearMonth);
    if (existing?.owner_edited && !input.force) return "skipped";
    const token = requireSlackBotToken();
    const data = await collectSlackAwards({
      token,
      writingMonth: slackHistoryYearMonth(input.yearMonth),
    });
    if (input.force) {
      await writeForcedSlackAwards({
        groupId: input.groupId,
        yearMonth: input.yearMonth,
        data,
        hidden: existing?.hidden ?? false,
      });
      return "saved";
    }
    return writeGeneratedSlackAwards({
      groupId: input.groupId,
      yearMonth: input.yearMonth,
      data,
    });
  } catch (error) {
    await alertSlackFailure(input.groupId, error);
    return "failed";
  }
}

/** Day-before-close draft for every group that opted in. One group's failure does not stop the next. */
export async function refreshDueSlackAwards(now: Date = new Date()): Promise<void> {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");
  await runSlackAwardsForGroups({
    groups: (groups ?? []) as Group[],
    now,
    generate: async (groupId, yearMonth) => {
      await generateSlackAwardsForGroup({ groupId, yearMonth, force: false });
    },
  });
}
