import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailGroupForm } from "@/components/email-group-form";
import { parseCapsuleArchive } from "@/lib/capsule-archive";
import { ensureCapsuleArchive, findMonthEdition } from "@/lib/compile";
import { groupDisplayName } from "@/lib/copy";
import { initials } from "@/lib/group-status";
import { canForceCycle } from "@/lib/manage";
import { capsuleTitle, DEFAULT_MONTH_VERSION } from "@/lib/month-version";
import { signedPhotoUrl } from "@/lib/photos";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { missedCountPhrase } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";

export async function CapsuleView({
  uuid,
  yearMonth,
  version = DEFAULT_MONTH_VERSION,
}: {
  uuid: string;
  yearMonth: string;
  version?: number;
}) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    notFound();
  }

  const { member: viewer, group } = await requireGroupMember(uuid);
  const admin = createAdminClient();
  const name = groupDisplayName(group.name);
  const month = await findMonthEdition(uuid, yearMonth, version);
  if (!month) notFound();

  const { data: capsule } = await admin.from("capsules").select("*").eq("month_id", month.id).maybeSingle();
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
    (await ensureCapsuleArchive(group, yearMonth, month.id, capsule, month.version));

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

  const title = capsuleTitle(monthLabel(yearMonth), month.version);

  return (
    <main className="main">
      <div className="wrap wrap--wide">
        <div className="stack stack--loose">
          <Link href={`/g/${uuid}`} className="backlink">
            ← {name}
          </Link>

          {canForceCycle(viewer.role) && !capsule.email_sent_at ? (
            <EmailGroupForm groupId={uuid} yearMonth={yearMonth} version={month.version} />
          ) : null}

          <article className="capsule">
            <header className="capsule__masthead">
              <p className="eyebrow">{name}</p>
              <h1 className="capsule__title">{title}</h1>
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
                          <img src={photo.url} alt="" width={photo.width} height={photo.height} />
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
