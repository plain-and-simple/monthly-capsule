import Link from "next/link";
import { SubmitForm } from "@/components/submit-form";
import { groupDisplayName } from "@/lib/copy";
import { nextOpenDateLabel, windowClosesPhrase } from "@/lib/group-status";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { capsuleHref, normalizeMonthVersion } from "@/lib/month-version";
import { signedPhotoUrl } from "@/lib/photos";
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
  const nextOpen = nextOpenDateLabel(group, submitWindow.closed);

  const { data: compiledMonths } = await admin
    .from("months")
    .select("year_month, version")
    .eq("group_id", uuid)
    .eq("status", "compiled")
    .order("year_month", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  const latestCompiled = compiledMonths?.[0]
    ? {
        yearMonth: compiledMonths[0].year_month as string,
        version: normalizeMonthVersion(compiledMonths[0].version),
      }
    : null;
  const latestCapsuleHref = latestCompiled
    ? capsuleHref(uuid, latestCompiled.yearMonth, latestCompiled.version)
    : null;

  let initialBody = "";
  let existingPhotos: Array<{ id: string; url: string }> = [];
  let initialStatus: SubmitStatus | null = null;
  let titleMonth = yearMonth;

  if (open && yearMonth && version != null) {
    const { data: month } = await admin
      .from("months")
      .select("id")
      .eq("group_id", uuid)
      .eq("year_month", yearMonth)
      .eq("version", version)
      .maybeSingle();

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
        const { data: photos } = await admin
          .from("photos")
          .select("id, storage_path")
          .eq("submission_id", submission.id)
          .order("sort_order", { ascending: true });
        existingPhotos = (
          await Promise.all(
            (photos ?? []).map(async (photo) => {
              const url = await signedPhotoUrl(photo.storage_path as string);
              return url ? { id: photo.id as string, url } : null;
            }),
          )
        ).filter((photo): photo is { id: string; url: string } => photo !== null);
      }
    }
  } else {
    const { data: months } = await admin
      .from("months")
      .select("id, year_month, version")
      .eq("group_id", uuid)
      .order("year_month", { ascending: false })
      .order("version", { ascending: false });

    for (const month of months ?? []) {
      const { data: submission } = await admin
        .from("submissions")
        .select("id, body, status")
        .eq("month_id", month.id)
        .eq("member_id", member.id)
        .maybeSingle();
      if (!submission) continue;
      titleMonth = month.year_month as string;
      initialBody = submission.body ?? "";
      initialStatus = ((submission.status as SubmitStatus | null) ?? "submitted") as SubmitStatus;
      const { data: photos } = await admin
        .from("photos")
        .select("id, storage_path")
        .eq("submission_id", submission.id)
        .order("sort_order", { ascending: true });
      existingPhotos = (
        await Promise.all(
          (photos ?? []).map(async (photo) => {
            const url = await signedPhotoUrl(photo.storage_path as string);
            return url ? { id: photo.id as string, url } : null;
          }),
        )
      ).filter((photo): photo is { id: string; url: string } => photo !== null);
      break;
    }
  }

  const title = titleMonth
    ? `Your ${monthLabel(titleMonth).replace(/ \d{4}$/, "")} letter`
    : "Your letter";
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
            existingPhotos={existingPhotos}
            initialStatus={initialStatus}
            title={title}
            closesPhrase={closes}
            nextOpenPhrase={nextOpen}
            capsuleHref={latestCapsuleHref}
            groupHref={`/g/${uuid}`}
          />
        </div>
      </div>
    </main>
  );
}
