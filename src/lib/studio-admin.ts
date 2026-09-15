import { groupDisplayName } from "@/lib/copy";

export const STUDIO_ADMIN_SELECT_GROUPS = "id, name";
export const STUDIO_ADMIN_SELECT_MEMBERS = "group_id";
export const STUDIO_ADMIN_SELECT_MONTHS = "id, group_id";
export const STUDIO_ADMIN_SELECT_CAPSULES = "month_id";

export const BAN_CONFIRM_VALUE = "1";

export function banConfirmAccepted(confirm: FormDataEntryValue | null): boolean {
  return String(confirm ?? "") === BAN_CONFIRM_VALUE;
}

export const STUDIO_ADMIN_FORBIDDEN_KEYS = [
  "email",
  "body",
  "letter",
  "letters",
  "photos",
  "storage_path",
  "html",
  "password_hash",
  "pin_hash",
  "archive",
] as const;

export type StudioGroupCounts = {
  groupId: string;
  groupName: string;
  memberCount: number;
  compileCount: number;
};

export function studioGroupCounts(input: {
  groups: Array<{ id: string; name: string | null }>;
  memberGroupIds: readonly string[];
  compileGroupIds: readonly string[];
}): StudioGroupCounts[] {
  const members = new Map<string, number>();
  for (const groupId of input.memberGroupIds) {
    members.set(groupId, (members.get(groupId) ?? 0) + 1);
  }
  const compiles = new Map<string, number>();
  for (const groupId of input.compileGroupIds) {
    compiles.set(groupId, (compiles.get(groupId) ?? 0) + 1);
  }

  return input.groups.map((group) => ({
    groupId: group.id,
    groupName: groupDisplayName(group.name),
    memberCount: members.get(group.id) ?? 0,
    compileCount: compiles.get(group.id) ?? 0,
  }));
}

export function compileGroupIdsFromRows(input: {
  months: Array<{ id: string; group_id: string }>;
  capsules: Array<{ month_id: string }>;
}): string[] {
  const groupByMonth = new Map(input.months.map((month) => [month.id, month.group_id]));
  const groupIds: string[] = [];
  for (const capsule of input.capsules) {
    const groupId = groupByMonth.get(capsule.month_id);
    if (groupId) groupIds.push(groupId);
  }
  return groupIds;
}

export function studioAdminLeaksPrivate(row: object): boolean {
  return Object.keys(row).some((key) => {
    const lower = key.toLowerCase();
    return (STUDIO_ADMIN_FORBIDDEN_KEYS as readonly string[]).includes(lower);
  });
}
