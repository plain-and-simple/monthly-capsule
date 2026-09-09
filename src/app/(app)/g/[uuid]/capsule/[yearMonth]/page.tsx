import Link from "next/link";
import { notFound } from "next/navigation";
import { groupDisplayName } from "@/lib/copy";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { signedPhotoUrl } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase";
import type { Member, Photo, Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CapsulePage({
  params,
}: {
  params: Promise<{ uuid: string; yearMonth: string }>;
}) {
  const { uuid, yearMonth } = await params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    notFound();
  }

  await requireGroupMember(uuid);
  const admin = createAdminClient();

  const { data: month } = await admin
    .from("months")
    .select("id")
    .eq("group_id", uuid)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (!month) notFound();

  const { data: capsule } = await admin
    .from("capsules")
    .select("id")
    .eq("month_id", month.id)
    .maybeSingle();
  if (!capsule) {
    return (
      <div className="space-y-4">
        <Link href={`/g/${uuid}`} className="link-quiet">
          Back
        </Link>
        <h1 className="font-serif text-4xl">Not ready</h1>
      </div>
    );
  }

  const { data: group } = await admin.from("groups").select("name").eq("id", uuid).single();
  const { data: submissions } = await admin
    .from("submissions")
    .select("*")
    .eq("month_id", month.id)
    .order("submitted_at", { ascending: true });

  const memberIds = (submissions ?? []).map((row) => row.member_id);
  const { data: members } =
    memberIds.length > 0
      ? await admin.from("members").select("*").in("id", memberIds)
      : { data: [] };

  const memberById = new Map(((members ?? []) as Member[]).map((member) => [member.id, member]));

  const letters = await Promise.all(
    ((submissions ?? []) as Submission[]).map(async (submission) => {
      const { data: photos } = await admin
        .from("photos")
        .select("*")
        .eq("submission_id", submission.id)
        .order("sort_order", { ascending: true });
      const withUrls = await Promise.all(
        ((photos ?? []) as Photo[]).map(async (photo) => ({
          ...photo,
          url: await signedPhotoUrl(photo.storage_path),
        })),
      );
      return {
        submission,
        member: memberById.get(submission.member_id),
        photos: withUrls,
      };
    }),
  );

  return (
    <article className="space-y-10">
      <Link href={`/g/${uuid}`} className="link-quiet">
        Back
      </Link>
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">{monthLabel(yearMonth)}</p>
        <h1 className="font-serif text-4xl font-medium leading-tight">
          {groupDisplayName(group?.name)}
        </h1>
      </header>
      {letters.length === 0 ? <p>No letters this month.</p> : null}
      {letters.map(({ submission, member, photos }) => (
        <section key={submission.id} className="space-y-4 border-t border-rule pt-8">
          <h2 className="font-serif text-2xl">{member?.preferred_name || "Friend"}</h2>
          {submission.body ? (
            <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">
              {submission.body}
            </p>
          ) : null}
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo) =>
                photo.url ? (
                  <img
                    key={photo.id}
                    src={photo.url}
                    alt=""
                    width={photo.width}
                    height={photo.height}
                    className="w-full rounded-md"
                  />
                ) : null,
              )}
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}
