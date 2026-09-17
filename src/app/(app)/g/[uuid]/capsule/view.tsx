import Link from "next/link";
import { notFound } from "next/navigation";
import { CapsuleDocument } from "@/components/capsule-document";
import { EmailGroupForm } from "@/components/email-group-form";
import { parseCapsuleArchive } from "@/lib/capsule-archive";
import { capsulePdfHref } from "@/lib/capsule-pdf";
import { ensureCapsuleArchive, findMonthEdition } from "@/lib/compile";
import {
  CAPSULE_NOT_READY_HEADING,
  CAPSULE_NOT_READY_HINT,
  DOWNLOAD_PDF_LABEL,
  groupDisplayName,
} from "@/lib/copy";
import { canForceCycle } from "@/lib/manage";
import { capsuleTitle, DEFAULT_MONTH_VERSION } from "@/lib/month-version";
import { signedPhotoUrls } from "@/lib/photos";
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
            <h1>{CAPSULE_NOT_READY_HEADING}</h1>
            <p className="muted">{CAPSULE_NOT_READY_HINT}</p>
          </div>
        </div>
      </main>
    );
  }

  const archive =
    parseCapsuleArchive(capsule.archive) ??
    (await ensureCapsuleArchive(group, yearMonth, month.id, capsule, month.version));

  const photoUrls = await signedPhotoUrls(
    archive.letters.flatMap((letter) => letter.photos.map((photo) => photo.storage_path)),
  );
  const letters = archive.letters.map((letter, index) => ({
    key: `${letter.preferred_name}-${index}`,
    preferred_name: letter.preferred_name,
    body: letter.body,
    photos: letter.photos.map((photo) => ({
      ...photo,
      url: photoUrls.get(photo.storage_path) ?? null,
    })),
  }));

  const title = capsuleTitle(monthLabel(yearMonth), month.version);

  return (
    <main className="main">
      <div className="wrap wrap--wide">
        <div className="stack stack--loose">
          <Link href={`/g/${uuid}`} className="backlink">
            ← {name}
          </Link>

          {canForceCycle(viewer.role) ? (
            <EmailGroupForm
              groupId={uuid}
              yearMonth={yearMonth}
              version={month.version}
              alreadySent={Boolean(capsule.email_sent_at)}
            />
          ) : null}

          <p className="capsule__keepsake">
            <a className="btn btn--secondary" href={capsulePdfHref(uuid, yearMonth, month.version)}>
              {DOWNLOAD_PDF_LABEL}
            </a>
          </p>

          <CapsuleDocument
            theme={archive.theme}
            groupName={name}
            title={title}
            letters={letters}
            missedPhrase={missedCountPhrase(archive.missed_count)}
          />
        </div>
      </div>
    </main>
  );
}
