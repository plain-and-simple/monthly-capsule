import "server-only";
import {
  buildCapsuleArchive,
  capsuleHasArchive,
  parseCapsuleArchive,
  type CapsuleArchive,
  type CapsuleArchiveLetter,
} from "@/lib/capsule-archive";
import { compileTargetYearMonth } from "@/lib/schedule";
import { includedSubmissions } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";
import type { Group, Photo, Submission } from "@/lib/types";

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

export async function snapshotMonthArchive(
  group: Group,
  yearMonth: string,
  monthId: string,
): Promise<CapsuleArchive> {
  const admin = createAdminClient();
  const [{ data: submissions }, { count: memberCount }] = await Promise.all([
    admin
      .from("submissions")
      .select("*")
      .eq("month_id", monthId)
      .order("submitted_at", { ascending: true }),
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", group.id),
  ]);

  const included = includedSubmissions((submissions ?? []) as Submission[]);
  const memberIds = included.map((row) => row.member_id);
  const { data: members } =
    memberIds.length > 0
      ? await admin.from("members").select("id, preferred_name").in("id", memberIds)
      : { data: [] };
  const nameById = new Map(
    ((members ?? []) as Array<{ id: string; preferred_name: string }>).map((row) => [
      row.id,
      row.preferred_name,
    ]),
  );

  const letters: CapsuleArchiveLetter[] = [];
  for (const submission of included) {
    const { data: photos } = await admin
      .from("photos")
      .select("storage_path, width, height, sort_order")
      .eq("submission_id", submission.id)
      .order("sort_order", { ascending: true });
    letters.push({
      preferred_name: nameById.get(submission.member_id) || "Friend",
      body: submission.body,
      photos: ((photos ?? []) as Pick<Photo, "storage_path" | "width" | "height" | "sort_order">[]).map(
        (photo, index) => ({
          storage_path: photo.storage_path,
          width: photo.width,
          height: photo.height,
          sort_order: photo.sort_order ?? index,
        }),
      ),
    });
  }

  return buildCapsuleArchive({
    yearMonth,
    groupName: group.name,
    letters,
    memberCount: memberCount ?? 0,
  });
}

async function writeCapsuleArchive(capsuleId: string, archive: CapsuleArchive) {
  const admin = createAdminClient();
  const { error } = await admin.from("capsules").update({ archive }).eq("id", capsuleId);
  return !error;
}

export async function ensureCapsuleArchive(
  group: Group,
  yearMonth: string,
  monthId: string,
  capsule: { id: string; archive?: unknown },
): Promise<CapsuleArchive> {
  const existing = parseCapsuleArchive(capsule.archive);
  if (existing) return existing;
  const archive = await snapshotMonthArchive(group, yearMonth, monthId);
  await writeCapsuleArchive(capsule.id, archive);
  return archive;
}

async function finishCompile(group: Group, yearMonth: string, monthId: string, created: boolean) {
  const admin = createAdminClient();
  await admin.from("months").update({ status: "compiled" }).eq("id", monthId);
  await clearForceOpenIfMatch(group, yearMonth);
  return { monthId, created };
}

export async function compileGroupMonth(group: Group, yearMonth: string) {
  const admin = createAdminClient();
  const month = await ensureMonth(group.id, yearMonth, "closed");
  const monthId = month.id as string;
  const archive = await snapshotMonthArchive(group, yearMonth, monthId);

  const { data: existing } = await admin
    .from("capsules")
    .select("*")
    .eq("month_id", monthId)
    .maybeSingle();

  if (existing) {
    if (!capsuleHasArchive(existing.archive)) {
      await writeCapsuleArchive(existing.id as string, archive);
    }
    return finishCompile(group, yearMonth, monthId, false);
  }

  const withArchive = await admin
    .from("capsules")
    .insert({ month_id: monthId, archive })
    .select("id")
    .maybeSingle();
  if (!withArchive.error && withArchive.data) {
    return finishCompile(group, yearMonth, monthId, true);
  }

  const withoutArchive = await admin
    .from("capsules")
    .insert({ month_id: monthId })
    .select("id")
    .maybeSingle();
  if (!withoutArchive.error && withoutArchive.data) {
    await writeCapsuleArchive(withoutArchive.data.id as string, archive);
    return finishCompile(group, yearMonth, monthId, true);
  }

  const { data: raced } = await admin
    .from("capsules")
    .select("id, archive")
    .eq("month_id", monthId)
    .maybeSingle();
  if (!raced) throw new Error("Could not compile capsule");
  if (!capsuleHasArchive(raced.archive)) {
    await writeCapsuleArchive(raced.id as string, archive);
  }
  return finishCompile(group, yearMonth, monthId, false);
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
