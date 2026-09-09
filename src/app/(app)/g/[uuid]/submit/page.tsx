import Link from "next/link";
import { SubmitForm } from "@/components/submit-form";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SubmitPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group, member } = await requireGroupMember(uuid);
  const submitWindow = await resolveSubmitWindow(group);
  const open = submitWindow.open;
  const admin = createAdminClient();
  const yearMonth = submitWindow.yearMonth;

  const { data: month } = yearMonth
    ? await admin
        .from("months")
        .select("id")
        .eq("group_id", uuid)
        .eq("year_month", yearMonth)
        .maybeSingle()
    : { data: null };

  let initialBody = "";
  let existingPhotoCount = 0;

  if (month) {
    const { data: submission } = await admin
      .from("submissions")
      .select("id, body")
      .eq("month_id", month.id)
      .eq("member_id", member.id)
      .maybeSingle();
    if (submission) {
      initialBody = submission.body ?? "";
      const { count } = await admin
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", submission.id);
      existingPhotoCount = count ?? 0;
    }
  }

  return (
    <div className="space-y-6">
      <Link href={`/g/${uuid}`} className="link-quiet">
        Back
      </Link>
      <SubmitForm
        groupId={uuid}
        closed={!open}
        initialBody={initialBody}
        existingPhotoCount={existingPhotoCount}
      />
    </div>
  );
}
