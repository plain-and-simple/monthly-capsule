import Link from "next/link";
import { GroupChrome } from "@/components/group-chrome";
import { SaveLoginForm } from "@/components/save-login-form";
import {
  GROUP_EARLIER_CAPSULES,
  GROUP_FIRST_CAPSULE_HEADING,
  GROUP_NO_PREVIOUS_CAPSULES,
  GROUP_PRIMARY_EDIT,
  GROUP_PRIMARY_SUBMIT,
  GROUP_PRIMARY_VIEW,
} from "@/lib/copy";
import { groupDisplayName } from "@/lib/copy";
import { nextOpenDateLabel, windowClosesPhrase } from "@/lib/group-status";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { capsuleHref, capsuleTitle, normalizeMonthVersion } from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { writtenCount, writtenCountPhrase } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GroupHomePage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const { group, member } = await requireGroupMember(uuid);
  const { open, yearMonth, version, closed } = await resolveSubmitWindow(group);
  const admin = createAdminClient();
  const name = groupDisplayName(group.name);

  const [{ count }, { data: compiledMonths }] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid),
    admin
      .from("months")
      .select("id, year_month, version")
      .eq("group_id", uuid)
      .eq("status", "compiled")
      .order("year_month", { ascending: false })
      .order("version", { ascending: false }),
  ]);

  const total = count ?? 0;
  const compiled = (compiledMonths ?? []).map((row) => ({
    yearMonth: row.year_month as string,
    version: normalizeMonthVersion(row.version),
  }));
  const latestCapsule = compiled[0];
  const earlier = compiled.slice(1);

  let myStatus: "none" | "draft" | "submitted" = "none";
  let written = 0;
  if (yearMonth && version != null) {
    const { data: month } = await admin
      .from("months")
      .select("id")
      .eq("group_id", uuid)
      .eq("year_month", yearMonth)
      .eq("version", version)
      .maybeSingle();
    if (month) {
      const { data: submissions } = await admin
        .from("submissions")
        .select("member_id, status")
        .eq("month_id", month.id);
      written = writtenCount((submissions ?? []) as Array<{ status?: string | null }>);
      const mine = (submissions ?? []).find((row) => row.member_id === member.id) as
        | Pick<Submission, "status">
        | undefined;
      if (mine?.status === "submitted") myStatus = "submitted";
      else if (mine) myStatus = "draft";
    }
  }

  const featuredMonth = open ? yearMonth : latestCapsule?.yearMonth;
  const featuredLabel = open && yearMonth
    ? capsuleTitle(monthLabel(yearMonth), version ?? 1)
    : latestCapsule
      ? capsuleTitle(monthLabel(latestCapsule.yearMonth), latestCapsule.version)
      : name;
  const closes = featuredMonth ? windowClosesPhrase(featuredMonth, group.submit_end_day) : "";
  const nextOpenDate = nextOpenDateLabel(group, closed);

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <Link className="backlink" href="/manage">
              ← Your groups
            </Link>
            <h1>{name}</h1>
          </div>

          <GroupChrome uuid={uuid} role={member.role} />

          {member.account_id ? null : <SaveLoginForm groupId={uuid} elevated />}

          <div className={`card card--pad-lg${myStatus === "submitted" && open ? " center" : ""}`}>
            <div className="stack">
              <div className="stack stack--tight">
                <div className="row row--between">
                  <p className="eyebrow">{featuredLabel}</p>
                  <span className={open ? "badge badge--open" : "badge badge--closed"}>
                    <span className="dot" />
                    {open ? "Open" : "Closed"}
                  </span>
                </div>
                {open && myStatus === "submitted" ? (
                  <>
                    <h2 className="serif" style={{ fontSize: "1.5rem" }}>
                      Your letter is in
                    </h2>
                    <p className="muted small">
                      {writtenCountPhrase(written, total)}. The capsule is made after the window
                      closes.
                    </p>
                  </>
                ) : open ? (
                  <>
                    <h2 className="serif" style={{ fontSize: "1.5rem" }}>
                      Writing is open until {closes}
                    </h2>
                    <p className="muted small">A few paragraphs is plenty.</p>
                  </>
                ) : latestCapsule ? (
                  <>
                    <h2 className="serif" style={{ fontSize: "1.5rem" }}>
                      The {capsuleTitle(monthLabel(latestCapsule.yearMonth), latestCapsule.version)}{" "}
                      capsule is ready
                    </h2>
                    <p className="muted small">Writing opens again on {nextOpenDate}.</p>
                  </>
                ) : (
                  <>
                    <h2 className="serif" style={{ fontSize: "1.5rem" }}>
                      {GROUP_FIRST_CAPSULE_HEADING}
                    </h2>
                    <p className="muted small">
                      Writing opens on {nextOpenDate}. Invite people now so everyone is ready.
                    </p>
                    <p className="muted tiny">{GROUP_NO_PREVIOUS_CAPSULES}</p>
                  </>
                )}
              </div>

              {open && myStatus === "submitted" ? (
                <div className="row" style={{ justifyContent: "center" }}>
                  <Link className="btn btn--secondary" href={`/g/${uuid}/submit`}>
                    {GROUP_PRIMARY_EDIT}
                  </Link>
                </div>
              ) : open ? (
                <>
                  <Link className="btn btn--primary btn--block btn--lg" href={`/g/${uuid}/submit`}>
                    {myStatus === "draft" ? "Continue your draft" : GROUP_PRIMARY_SUBMIT}
                  </Link>
                  <p className="btn-note">You can keep editing until the window closes.</p>
                </>
              ) : latestCapsule ? (
                <>
                  <Link
                    className="btn btn--primary btn--block btn--lg"
                    href={capsuleHref(uuid, latestCapsule.yearMonth, latestCapsule.version)}
                  >
                    {GROUP_PRIMARY_VIEW}
                  </Link>
                  <p className="btn-note">Writing opens again on {nextOpenDate}.</p>
                </>
              ) : (
                <>
                  <Link className="btn btn--primary btn--block btn--lg" href={`/g/${uuid}/invite`}>
                    Invite people
                  </Link>
                  <p className="btn-note">Writing opens on {nextOpenDate}.</p>
                </>
              )}
            </div>
          </div>

          {open ? (
            <div className="panel">
              <div className="stack stack--tight">
                <p className="small">
                  <b>{writtenCountPhrase(written, total)}</b>
                </p>
                <p className="muted tiny">Nobody is named. It is just a count.</p>
              </div>
            </div>
          ) : null}

          {earlier.length > 0 ? (
            <div className="stack stack--tight">
              <p className="eyebrow">{GROUP_EARLIER_CAPSULES}</p>
              <ul className="list">
                {earlier.map((row) => (
                  <li key={`${row.yearMonth}-${row.version}`}>
                    <Link
                      className="listitem"
                      href={capsuleHref(uuid, row.yearMonth, row.version)}
                    >
                      <span className="listitem__body">
                        <span className="listitem__title">
                          {capsuleTitle(monthLabel(row.yearMonth), row.version)}
                        </span>
                      </span>
                      <span className="listitem__end">Read</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : compiled.length > 0 ? (
            <div className="stack stack--tight">
              <p className="eyebrow">{GROUP_EARLIER_CAPSULES}</p>
              <p className="muted small">{GROUP_NO_PREVIOUS_CAPSULES}</p>
            </div>
          ) : null}

          {open && latestCapsule ? (
            <>
              <hr className="rule" />
              <div className="stack">
                <p className="small muted">
                  Last month:{" "}
                  <Link href={capsuleHref(uuid, latestCapsule.yearMonth, latestCapsule.version)}>
                    the {capsuleTitle(monthLabel(latestCapsule.yearMonth), latestCapsule.version)}{" "}
                    capsule
                  </Link>
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
