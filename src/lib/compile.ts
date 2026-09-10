import "server-only";
import {
  buildCapsuleArchive,
  capsuleHasArchive,
  parseCapsuleArchive,
  type CapsuleArchive,
  type CapsuleArchiveLetter,
} from "@/lib/capsule-archive";
import {
  DEFAULT_MONTH_VERSION,
  latestEdition,
  normalizeMonthVersion,
  openEdition,
  type CycleMonthRow,
} from "@/lib/month-version";
import { compileTargetYearMonth } from "@/lib/schedule";
import { includedSubmissions } from "@/lib/submit";
import { generateAndStoreCapsulePdf } from "@/lib/capsule-pdf-store";
import { createAdminClient } from "@/lib/supabase";
import type { Capsule, Group, Month, Photo, Submission } from "@/lib/types";

function asMonth(row: Record<string, unknown>): Month {
  return {
    id: row.id as string,
    group_id: row.group_id as string,
    year_month: row.year_month as string,
    version: normalizeMonthVersion(row.version),
    status: row.status as Month["status"],
    created_at: row.created_at as string,
  };
}

export async function listGroupMonthRows(groupId: string): Promise<Month[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("months").select("*").eq("group_id", groupId);
  if (error) throw new Error("Could not load months");
  return (data ?? []).map((row) => asMonth(row as Record<string, unknown>));
}

export function toCycleMonthRows(months: readonly Month[]): CycleMonthRow[] {
  return months.map((month) => ({
    year_month: month.year_month,
    version: month.version,
    status: month.status,
  }));
}

export async function findMonthEdition(groupId: string, yearMonth: string, version: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("months")
    .select("*")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new Error("Could not load month");
  return data ? asMonth(data as Record<string, unknown>) : null;
}

async function createMonth(groupId: string, yearMonth: string, version: number, status: string) {
  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("months")
    .insert({ group_id: groupId, year_month: yearMonth, version, status })
    .select("*")
    .single();

  if (!error && created) return asMonth(created as Record<string, unknown>);

  const raced = await findMonthEdition(groupId, yearMonth, version);
  if (raced) return raced;
  throw new Error("Could not create month");
}

export async function ensureMonth(
  groupId: string,
  yearMonth: string,
  status: string,
  version?: number,
) {
  const edition = version != null ? normalizeMonthVersion(version) : null;
  if (edition != null) {
    const existing = await findMonthEdition(groupId, yearMonth, edition);
    if (!existing) return createMonth(groupId, yearMonth, edition, status);

    if (status === "open" && existing.status === "closed") {
      const admin = createAdminClient();
      const { error } = await admin.from("months").update({ status: "open" }).eq("id", existing.id);
      if (error) throw new Error("Could not reopen month");
      return { ...existing, status: "open" as const };
    }
    if (status === "open" && existing.status === "compiled") {
      throw new Error("Cannot reopen a compiled edition");
    }
    return existing;
  }

  const rows = (await listGroupMonthRows(groupId)).filter((row) => row.year_month === yearMonth);
  const open = rows.find((row) => row.status === "open");
  if (open) return open;

  if (status === "open") {
    if (rows.some((row) => row.status === "compiled")) {
      throw new Error("No open edition");
    }
    const closed = rows.find((row) => row.status === "closed");
    if (closed) {
      const admin = createAdminClient();
      const { error } = await admin.from("months").update({ status: "open" }).eq("id", closed.id);
      if (error) throw new Error("Could not reopen month");
      return { ...closed, status: "open" as const };
    }
    return createMonth(groupId, yearMonth, DEFAULT_MONTH_VERSION, "open");
  }

  const latest = [...rows].sort((a, b) => b.version - a.version)[0];
  if (latest) return latest;
  return createMonth(groupId, yearMonth, DEFAULT_MONTH_VERSION, status);
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
  const months = await listGroupMonthRows(groupId);
  return [
    ...new Set(
      months
        .filter((row) => row.status === "closed" || row.status === "compiled")
        .map((row) => row.year_month),
    ),
  ];
}

export async function findGroupCapsule(groupId: string, yearMonth: string, version?: number) {
  const admin = createAdminClient();
  let month: Month | null = null;
  if (version != null) {
    month = await findMonthEdition(groupId, yearMonth, version);
  } else {
    const { data: compiled } = await admin
      .from("months")
      .select("*")
      .eq("group_id", groupId)
      .eq("year_month", yearMonth)
      .eq("status", "compiled")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    month = compiled
      ? asMonth(compiled as Record<string, unknown>)
      : ((await listGroupMonthRows(groupId))
          .filter((row) => row.year_month === yearMonth)
          .sort((a, b) => b.version - a.version)[0] ?? null);
  }
  if (!month) return { month: null, capsule: null };

  const { data: capsule } = await admin.from("capsules").select("*").eq("month_id", month.id).maybeSingle();
  return { month, capsule };
}

export async function snapshotMonthArchive(
  group: Group,
  yearMonth: string,
  monthId: string,
  monthVersion: number = DEFAULT_MONTH_VERSION,
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
    monthVersion,
  });
}

async function writeCapsuleArchive(capsuleId: string, archive: CapsuleArchive) {
  const admin = createAdminClient();
  const { error } = await admin.from("capsules").update({ archive }).eq("id", capsuleId);
  return !error;
}

async function writeCapsulePdfKeepsake(input: {
  capsuleId: string;
  group: Group;
  yearMonth: string;
  version: number;
  archive: CapsuleArchive;
  pdfStoragePath?: string | null;
}) {
  if (input.pdfStoragePath) return;
  try {
    await generateAndStoreCapsulePdf({
      capsuleId: input.capsuleId,
      groupId: input.group.id,
      groupName: input.group.name,
      yearMonth: input.yearMonth,
      version: input.version,
      archive: input.archive,
    });
  } catch (error) {
    console.error("capsule pdf generate failed", error);
  }
}

export async function ensureCapsuleArchive(
  group: Group,
  yearMonth: string,
  monthId: string,
  capsule: { id: string; archive?: unknown },
  monthVersion: number = DEFAULT_MONTH_VERSION,
): Promise<CapsuleArchive> {
  const existing = parseCapsuleArchive(capsule.archive);
  if (existing) return existing;
  const archive = await snapshotMonthArchive(group, yearMonth, monthId, monthVersion);
  await writeCapsuleArchive(capsule.id, archive);
  return archive;
}

async function finishCompile(group: Group, yearMonth: string, monthId: string, created: boolean) {
  const admin = createAdminClient();
  await admin.from("months").update({ status: "compiled" }).eq("id", monthId);
  await clearForceOpenIfMatch(group, yearMonth);
  return { monthId, created };
}

export async function compileGroupMonth(group: Group, yearMonth: string, version?: number) {
  const admin = createAdminClient();
  const month = await ensureMonth(group.id, yearMonth, "closed", version);
  const monthId = month.id;
  const monthVersion = month.version;
  const archive = await snapshotMonthArchive(group, yearMonth, monthId, monthVersion);

  const { data: existing } = await admin.from("capsules").select("*").eq("month_id", monthId).maybeSingle();

  if (existing) {
    const capsuleId = existing.id as string;
    if (!capsuleHasArchive(existing.archive)) {
      await writeCapsuleArchive(capsuleId, archive);
    }
    await writeCapsulePdfKeepsake({
      capsuleId,
      group,
      yearMonth,
      version: monthVersion,
      archive: parseCapsuleArchive(existing.archive) ?? archive,
      pdfStoragePath: (existing as Capsule).pdf_storage_path,
    });
    return finishCompile(group, yearMonth, monthId, false);
  }

  const withArchive = await admin
    .from("capsules")
    .insert({ month_id: monthId, archive })
    .select("id")
    .maybeSingle();
  if (!withArchive.error && withArchive.data) {
    await writeCapsulePdfKeepsake({
      capsuleId: withArchive.data.id as string,
      group,
      yearMonth,
      version: monthVersion,
      archive,
    });
    return finishCompile(group, yearMonth, monthId, true);
  }

  const withoutArchive = await admin
    .from("capsules")
    .insert({ month_id: monthId })
    .select("id")
    .maybeSingle();
  if (!withoutArchive.error && withoutArchive.data) {
    await writeCapsuleArchive(withoutArchive.data.id as string, archive);
    await writeCapsulePdfKeepsake({
      capsuleId: withoutArchive.data.id as string,
      group,
      yearMonth,
      version: monthVersion,
      archive,
    });
    return finishCompile(group, yearMonth, monthId, true);
  }

  const { data: raced } = await admin
    .from("capsules")
    .select("id, archive, pdf_storage_path")
    .eq("month_id", monthId)
    .maybeSingle();
  if (!raced) throw new Error("Could not compile capsule");
  if (!capsuleHasArchive(raced.archive)) {
    await writeCapsuleArchive(raced.id as string, archive);
  }
  await writeCapsulePdfKeepsake({
    capsuleId: raced.id as string,
    group,
    yearMonth,
    version: monthVersion,
    archive: parseCapsuleArchive(raced.archive) ?? archive,
    pdfStoragePath: raced.pdf_storage_path as string | null | undefined,
  });
  return finishCompile(group, yearMonth, monthId, false);
}

export async function latestUnsentYearMonth(groupId: string): Promise<string | null> {
  const found = await latestUnsentCapsule(groupId);
  return found?.yearMonth ?? null;
}

export async function latestUnsentCapsule(
  groupId: string,
): Promise<{ yearMonth: string; version: number } | null> {
  const admin = createAdminClient();
  const { data: months, error } = await admin
    .from("months")
    .select("id, year_month, version")
    .eq("group_id", groupId)
    .eq("status", "compiled")
    .order("year_month", { ascending: false })
    .order("version", { ascending: false });
  if (error || !months?.length) return null;

  for (const month of months) {
    const { data: capsule } = await admin
      .from("capsules")
      .select("email_sent_at")
      .eq("month_id", month.id)
      .maybeSingle();
    if (capsule && !capsule.email_sent_at) {
      return {
        yearMonth: month.year_month as string,
        version: normalizeMonthVersion(month.version),
      };
    }
  }
  return null;
}

export async function compileDueCapsules(now: Date = new Date()) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");

  const results: { groupId: string; yearMonth: string; version: number; created: boolean }[] = [];
  for (const group of (groups ?? []) as Group[]) {
    const yearMonth = compileTargetYearMonth(group, now);
    const rows = toCycleMonthRows(await listGroupMonthRows(group.id));
    const open = openEdition(rows, yearMonth);
    const version = open?.version ?? latestEdition(rows, yearMonth)?.version;
    const result = await compileGroupMonth(group, yearMonth, version);
    results.push({
      groupId: group.id,
      yearMonth,
      version: version ?? DEFAULT_MONTH_VERSION,
      created: result.created,
    });
  }
  return results;
}
