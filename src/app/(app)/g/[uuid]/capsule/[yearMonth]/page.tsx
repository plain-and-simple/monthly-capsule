import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailGroupForm } from "@/components/email-group-form";
import { parseCapsuleArchive } from "@/lib/capsule-archive";
import { ensureCapsuleArchive } from "@/lib/compile";
import { groupDisplayName } from "@/lib/copy";
import { initials } from "@/lib/group-status";
import { canForceCycle } from "@/lib/manage";
import { signedPhotoUrl } from "@/lib/photos";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { missedCountPhrase } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";

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
    .select("*")
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

  const archive =
    parseCapsuleArchive(capsule.archive) ??
    (await ensureCapsuleArchive(group, yearMonth, month.id, capsule));

  const letters = await Promise.all(
    archive.letters.map(async (letter, index) => ({
      key: `${letter.preferred_name}-${index}`,
      preferred_name: letter.preferred_name,
      body: letter.body,
      photos: await Promise.all(
        letter.photos.map(async (photo) => ({
          ...photo,
          url: await signedPhotoUrl(photo.storage_path),
        })),
      ),
    })),
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
                  ? ` from ${letters.map((letter) => letter.preferred_name).join(", ")}`
                  : ""}
              </p>
              {letters.length > 0 ? (
                <ul className="capsule__contents">
                  {letters.map((letter) => (
                    <li key={letter.key}>{letter.preferred_name}</li>
                  ))}
                </ul>
              ) : null}
            </header>

            {letters.length === 0 ? <p className="center muted">No letters this month.</p> : null}

            {letters.map((letter) => (
              <section className="letter" key={letter.key}>
                <div className="letter__head">
                  <span className="avatar">{initials(letter.preferred_name)}</span>
                  <div>
                    <div className="letter__name">{letter.preferred_name}</div>
                  </div>
                </div>
                {letter.body ? <div className="letter__body">{letter.body}</div> : null}
                {letter.photos.length > 0 ? (
                  <div className="letter__photos">
                    {letter.photos.map((photo) =>
                      photo.url ? (
                        <div className="photo" key={photo.storage_path}>
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
              <p>{missedCountPhrase(archive.missed_count)}</p>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
