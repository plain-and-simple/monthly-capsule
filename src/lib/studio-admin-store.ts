import "server-only";
import {
  compileGroupIdsFromRows,
  STUDIO_ADMIN_SELECT_CAPSULES,
  STUDIO_ADMIN_SELECT_GROUPS,
  STUDIO_ADMIN_SELECT_MEMBERS,
  STUDIO_ADMIN_SELECT_MONTHS,
  studioGroupCounts,
  type StudioGroupCounts,
} from "@/lib/studio-admin";
import { createAdminClient } from "@/lib/supabase";

export async function loadStudioGroupCounts(): Promise<StudioGroupCounts[]> {
  const admin = createAdminClient();
  const [{ data: groups }, { data: members }, { data: months }, { data: capsules }] =
    await Promise.all([
      admin.from("groups").select(STUDIO_ADMIN_SELECT_GROUPS).order("created_at", { ascending: true }),
      admin.from("members").select(STUDIO_ADMIN_SELECT_MEMBERS).is("removed_at", null),
      admin.from("months").select(STUDIO_ADMIN_SELECT_MONTHS),
      admin.from("capsules").select(STUDIO_ADMIN_SELECT_CAPSULES),
    ]);

  return studioGroupCounts({
    groups: (groups ?? []) as Array<{ id: string; name: string | null }>,
    memberGroupIds: ((members ?? []) as Array<{ group_id: string }>).map((row) => row.group_id),
    compileGroupIds: compileGroupIdsFromRows({
      months: (months ?? []) as Array<{ id: string; group_id: string }>,
      capsules: (capsules ?? []) as Array<{ month_id: string }>,
    }),
  });
}
