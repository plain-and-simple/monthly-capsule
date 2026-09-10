import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailGroupForm } from "@/components/email-group-form";
import { groupDisplayName } from "@/lib/copy";
import { initials } from "@/lib/group-status";
import { canForceCycle } from "@/lib/manage";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { signedPhotoUrl } from "@/lib/photos";
import { includedSubmissions, missedCountPhrase, writtenCount } from "@/lib/submit";
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

  const { member: viewer, group } = await requireGroupMember(uuid);
  const admin = createAdminClient();
  const name = groupDisplayName(group.name);

  const { data: month } = await admin
    .from("months")
    .select("id")
    .eq("group_id", uuid)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (!month) notFound();

  const { data: capsule } = await admin
    .from("capsules")
    .select("id, email_sent_at")
    .eq("month_id", month.id)
    .maybeSingle();
  if (!capsule) {
    return (
      <main className="main">
        <div className="wrap">
          <div className="stack">
            <Link href={`/g/${uuid}`} className="backlink">
              ← {name}
            </Link>
            <h1>Not ready</h1>
          </div>
        </div>
      </main>
    );
  }

  const [{ data: submissions }, { count: memberCount }] = await Promise.all([
    admin.from("submissions").select("*").eq("month_id", month.id).order("submitted_at", { ascending: true }),
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid),
  ]);

  const included = includedSubmissions((submissions ?? []) as Submission[]);
  const memberIds = included.map((row) => row.member_id);
  const { data: members } =
    memberIds.length > 0
      ? await admin.from("members").select("*").in("id", memberIds)
      : { data: [] };

  const memberById = new Map(((members ?? []) as Member[]).map((row) => [row.id, row]));
  const missed = Math.max(0, (memberCount ?? 0) - writtenCount(included));

  const letters = await Promise.all(
    included.map(async (submission) => {
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
    <main className="main">
      <div className="wrap wrap--wide">
        <div className="stack stack--loose">
          <Link href={`/g/${uuid}`} className="backlink">
            ← {name}
          </Link>

          {canForceCycle(viewer.role) && !capsule.email_sent_at ? (
            <EmailGroupForm groupId={uuid} yearMonth={yearMonth} />
          ) : null}

          <article className="capsule">
            <header className="capsule__masthead">
              <p className="eyebrow">{name}</p>
              <h1 className="capsule__title">{monthLabel(yearMonth)}</h1>
              <p className="muted small">
                {letters.length} {letters.length === 1 ? "letter" : "letters"}
                {letters.length > 0
                  ? ` from ${letters.map(({ member }) => member?.preferred_name || "Friend").join(", ")}`
                  : ""}
              </p>
              {letters.length > 0 ? (
                <ul className="capsule__contents">
                  {letters.map(({ member, submission }) => (
                    <li key={submission.id}>{member?.preferred_name || "Friend"}</li>
                  ))}
                </ul>
              ) : null}
            </header>

            {letters.length === 0 ? <p className="center muted">No letters this month.</p> : null}

            {letters.map(({ submission, member, photos }) => (
              <section className="letter" key={submission.id}>
                <div className="letter__head">
                  <span className="avatar">{initials(member?.preferred_name || "Friend")}</span>
                  <div>
                    <div className="letter__name">{member?.preferred_name || "Friend"}</div>
                  </div>
                </div>
                {submission.body ? <div className="letter__body">{submission.body}</div> : null}
                {photos.length > 0 ? (
                  <div className="letter__photos">
                    {photos.map((photo) =>
                      photo.url ? (
                        <div className="photo" key={photo.id}>
                          <img
                            src={photo.url}
                            alt=""
                            width={photo.width}
                            height={photo.height}
                          />
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </section>
            ))}

            <div className="capsule__colophon">
              <p>{missedCountPhrase(missed)}</p>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
