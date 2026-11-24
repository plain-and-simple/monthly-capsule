import "server-only";

import {
  loadVisibleSlackAwardsFrom,
  parseSlackAwardsData,
  saveGeneratedSlackAwards,
  type SlackAwardsData,
  type SlackAwardsGateway,
  type SlackAwardsRow,
} from "@/lib/slack-awards";
import { createAdminClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type AwardsTable = {
  data: unknown;
  owner_edited: boolean | null;
  hidden: boolean | null;
  generated_at: string | null;
};

function rowFromDb(data: AwardsTable | null): SlackAwardsRow | null {
  if (!data) return null;
  const parsed = parseSlackAwardsData(data.data);
  return {
    data: parsed ?? { senders: [], channel: null, mostReplies: null, mostReactions: null },
    owner_edited: data.owner_edited === true,
    hidden: data.hidden === true,
    generated_at: typeof data.generated_at === "string" ? data.generated_at : null,
  };
}

export function supabaseSlackAwardsGateway(admin: SupabaseClient): SlackAwardsGateway {
  return {
    async read(groupId, yearMonth) {
      const { data, error } = await admin
        .from("group_slack_awards")
        .select("data, owner_edited, hidden, generated_at")
        .eq("group_id", groupId)
        .eq("year_month", yearMonth)
        .maybeSingle();
      if (error) throw new Error("slack_awards_read_failed");
      return rowFromDb((data as AwardsTable | null) ?? null);
    },
    async insert(groupId, yearMonth, row) {
      const { error } = await admin.from("group_slack_awards").insert({
        group_id: groupId,
        year_month: yearMonth,
        data: row.data,
        owner_edited: false,
        hidden: row.hidden,
        generated_at: row.generated_at,
        updated_at: row.generated_at,
      });
      if (!error) return "ok";
      if (error.code === "23505") return "conflict";
      throw new Error("slack_awards_write_failed");
    },
    async updateUnedited(groupId, yearMonth, row) {
      const { data, error } = await admin
        .from("group_slack_awards")
        .update({
          data: row.data,
          owner_edited: false,
          hidden: row.hidden,
          generated_at: row.generated_at,
          updated_at: row.generated_at,
        })
        .eq("group_id", groupId)
        .eq("year_month", yearMonth)
        .eq("owner_edited", false)
        .select("group_id");
      if (error) throw new Error("slack_awards_write_failed");
      return Array.isArray(data) && data.length > 0;
    },
  };
}

export async function readSlackAwardsRow(
  groupId: string,
  yearMonth: string,
): Promise<SlackAwardsRow | null> {
  return supabaseSlackAwardsGateway(createAdminClient()).read(groupId, yearMonth);
}

export async function writeGeneratedSlackAwards(input: {
  groupId: string;
  yearMonth: string;
  data: SlackAwardsData;
  nowIso?: string;
}): Promise<"saved" | "skipped"> {
  return saveGeneratedSlackAwards(supabaseSlackAwardsGateway(createAdminClient()), {
    groupId: input.groupId,
    yearMonth: input.yearMonth,
    data: input.data,
    nowIso: input.nowIso ?? new Date().toISOString(),
  });
}

export async function writeOwnerSlackAwards(input: {
  groupId: string;
  yearMonth: string;
  data: SlackAwardsData;
  hidden: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("group_slack_awards").upsert(
    {
      group_id: input.groupId,
      year_month: input.yearMonth,
      data: input.data,
      owner_edited: true,
      hidden: input.hidden,
      updated_at: now,
    },
    { onConflict: "group_id,year_month" },
  );
  if (error) throw new Error("slack_awards_write_failed");
}

export async function writeForcedSlackAwards(input: {
  groupId: string;
  yearMonth: string;
  data: SlackAwardsData;
  hidden: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("group_slack_awards").upsert(
    {
      group_id: input.groupId,
      year_month: input.yearMonth,
      data: input.data,
      owner_edited: false,
      hidden: input.hidden,
      generated_at: now,
      updated_at: now,
    },
    { onConflict: "group_id,year_month" },
  );
  if (error) throw new Error("slack_awards_write_failed");
}

export async function loadVisibleSlackAwards(
  group: { id: string; slack_awards_enabled?: boolean | null },
  yearMonth: string,
): Promise<SlackAwardsData | undefined> {
  return loadVisibleSlackAwardsFrom({
    enabled: group.slack_awards_enabled === true,
    read: () => readSlackAwardsRow(group.id, yearMonth),
  });
}

export async function setSlackAwardsEnabled(groupId: string, enabled: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("groups")
    .update({ slack_awards_enabled: enabled })
    .eq("id", groupId);
  if (error) throw new Error("slack_awards_write_failed");
}
