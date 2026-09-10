import Link from "next/link";
import { SubmitForm } from "@/components/submit-form";
import { groupDisplayName } from "@/lib/copy";
import { windowClosesPhrase } from "@/lib/group-status";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { SubmitStatus } from "@/lib/submit";

export const dynamic = "force-dynamic";

export default async function SubmitPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group, member } = await requireGroupMember(uuid);
  const submitWindow = await resolveSubmitWindow(group);
  const open = submitWindow.open;
  const admin = createAdminClient();
  const yearMonth = submitWindow.yearMonth;
  const version = submitWindow.version;
  const name = groupDisplayName(group.name);

  const { data: month } =
    yearMonth && version != null
      ? await admin
          .from("months")
          .select("id")
          .eq("group_id", uuid)
          .eq("year_month", yearMonth)
          .eq("version", version)
          .maybeSingle()
      : { data: null };

  let initialBody = "";
  let existingPhotoCount = 0;
  let initialStatus: SubmitStatus | null = null;

  if (month) {
    const { data: submission } = await admin
      .from("submissions")
      .select("id, body, status")
      .eq("month_id", month.id)
      .eq("member_id", member.id)
      .maybeSingle();
    if (submission) {
      initialBody = submission.body ?? "";
      initialStatus = ((submission.status as SubmitStatus | null) ?? "submitted") as SubmitStatus;
      const { count } = await admin
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", submission.id);
      existingPhotoCount = count ?? 0;
    }
  }

  const title = yearMonth ? `Your ${monthLabel(yearMonth).replace(/ \d{4}$/, "")} letter` : "Your letter";
  const closes = yearMonth ? windowClosesPhrase(yearMonth, group.submit_end_day) : "the window closes";

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack stack--loose">
          <Link href={`/g/${uuid}`} className="backlink">
            ← {name}
          </Link>
          <SubmitForm
            groupId={uuid}
            closed={!open}
            initialBody={initialBody}
            existingPhotoCount={existingPhotoCount}
            initialStatus={initialStatus}
            title={title}
            closesPhrase={closes}
          />
        </div>
      </div>
    </main>
  );
}
