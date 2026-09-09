import "server-only";
import { compileTargetYearMonth } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase";
import type { Group } from "@/lib/types";

export async function ensureMonth(groupId: string, yearMonth: string, status: string) {
  const admin = createAdminClient();
  const { data: existing, error: findError } = await admin
    .from("months")
    .select("*")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth)
    .maybeSingle();

  if (findError) {
    throw new Error("Could not load month");
  }
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("months")
    .insert({ group_id: groupId, year_month: yearMonth, status })
    .select("*")
    .single();

  if (error) {
    const { data: raced } = await admin
      .from("months")
      .select("*")
      .eq("group_id", groupId)
      .eq("year_month", yearMonth)
      .maybeSingle();
    if (raced) return raced;
    throw new Error("Could not create month");
  }
  return created;
}

async function clearForceOpenIfMatch(group: Group, yearMonth: string) {
  if (group.force_open_year_month !== yearMonth) return;
  const admin = createAdminClient();
  await admin
    .from("groups")
    .update({ force_open_year_month: null })
    .eq("id", group.id)
    .eq("force_open_year_month", yearMonth);
}

export async function closedYearMonths(groupId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("months")
    .select("year_month")
    .eq("group_id", groupId)
    .in("status", ["closed", "compiled"]);
  if (error) throw new Error("Could not load months");
  return (data ?? []).map((row) => row.year_month as string);
}

export async function findGroupCapsule(groupId: string, yearMonth: string) {
  const admin = createAdminClient();
  const { data: month } = await admin
    .from("months")
    .select("id, year_month, status")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (!month) return { month: null, capsule: null };

  const { data: capsule } = await admin
    .from("capsules")
    .select("*")
    .eq("month_id", month.id)
    .maybeSingle();
  return { month, capsule };
}

export async function compileGroupMonth(group: Group, yearMonth: string) {
  const admin = createAdminClient();
  const month = await ensureMonth(group.id, yearMonth, "closed");

  const { data: existing } = await admin
    .from("capsules")
    .select("id")
    .eq("month_id", month.id)
    .maybeSingle();

  if (existing) {
    if (month.status !== "compiled") {
      await admin.from("months").update({ status: "compiled" }).eq("id", month.id);
    }
    await clearForceOpenIfMatch(group, yearMonth);
    return { monthId: month.id as string, created: false };
  }

  const { error } = await admin.from("capsules").insert({ month_id: month.id });
  if (error) {
    const { data: raced } = await admin
      .from("capsules")
      .select("id")
      .eq("month_id", month.id)
      .maybeSingle();
    if (!raced) throw new Error("Could not compile capsule");
    await admin.from("months").update({ status: "compiled" }).eq("id", month.id);
    await clearForceOpenIfMatch(group, yearMonth);
    return { monthId: month.id as string, created: false };
  }

  await admin.from("months").update({ status: "compiled" }).eq("id", month.id);
  await clearForceOpenIfMatch(group, yearMonth);
  return { monthId: month.id as string, created: true };
}

export async function latestUnsentYearMonth(groupId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: months, error } = await admin
    .from("months")
    .select("id, year_month")
    .eq("group_id", groupId)
    .eq("status", "compiled")
    .order("year_month", { ascending: false });
  if (error || !months?.length) return null;

  for (const month of months) {
    const { data: capsule } = await admin
      .from("capsules")
      .select("email_sent_at")
      .eq("month_id", month.id)
      .maybeSingle();
    if (capsule && !capsule.email_sent_at) {
      return month.year_month as string;
    }
  }
  return null;
}

export async function compileDueCapsules(now: Date = new Date()) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");

  const results: { groupId: string; yearMonth: string; created: boolean }[] = [];
  for (const group of (groups ?? []) as Group[]) {
    const yearMonth = compileTargetYearMonth(group, now);
    const result = await compileGroupMonth(group, yearMonth);
    results.push({ groupId: group.id, yearMonth, created: result.created });
  }
  return results;
}
