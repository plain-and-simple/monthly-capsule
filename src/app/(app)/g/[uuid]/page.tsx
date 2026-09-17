import Link from "next/link";
import { CycleForm } from "@/components/cycle-form";
import { GroupChrome } from "@/components/group-chrome";
import { KickMemberForm } from "@/components/kick-member-form";
import { PendingLink } from "@/components/pending-link";
import { SaveLoginForm } from "@/components/save-login-form";
import { latestUnsentCapsule } from "@/lib/compile";
import {
  GROUP_EARLIER_CAPSULES,
  GROUP_FIRST_CAPSULE_HEADING,
  GROUP_NO_PREVIOUS_CAPSULES,
  GROUP_PEOPLE_HEADING,
  GROUP_PRIMARY_EDIT,
  GROUP_PRIMARY_SUBMIT,
  GROUP_PRIMARY_VIEW,
} from "@/lib/copy";
import { groupDisplayName } from "@/lib/copy";
import { initials, nextOpenDateLabel, windowClosesPhrase } from "@/lib/group-status";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { ROSTER_SELECT, canForceCycle, canKickMember, toRoster } from "@/lib/manage";
import {
  capsuleHref,
  capsuleTitle,
  closedCountForMonth,
  earlierCapsuleRows,
  earlierCapsuleTitle,
  normalizeMonthVersion,
} from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { parseFlashError } from "@/lib/session-policy";
import { writtenCount, writtenCountPhrase } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";
import type { Role, Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GroupHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { uuid } = await params;
  const error = parseFlashError((await searchParams).error);
  const { group, member } = await requireGroupMember(uuid);
  const [{ open, yearMonth, version, closed }, unsent] = await Promise.all([
    resolveSubmitWindow(group),
    canForceCycle(member.role) ? latestUnsentCapsule(uuid) : Promise.resolve(null),
  ]);
  const admin = createAdminClient();
  const name = groupDisplayName(group.name);

  const [{ count }, { data: compiledMonths }, { data: rosterRows }] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid).is("removed_at", null),
    admin
      .from("months")
      .select("id, year_month, version")
      .eq("group_id", uuid)
      .eq("status", "compiled")
      .order("year_month", { ascending: false })
      .order("version", { ascending: false }),
    admin
      .from("members")
      .select(ROSTER_SELECT)
      .eq("group_id", uuid)
      .is("removed_at", null)
      .order("joined_at", { ascending: true }),
  ]);

  const total = count ?? 0;
  const compiled = (compiledMonths ?? []).map((row) => ({
    yearMonth: row.year_month as string,
    version: normalizeMonthVersion(row.version),
  }));
  const latestCapsule = compiled[0];
  const earlier = earlierCapsuleRows(compiled, open);
  const people = toRoster(
    (rosterRows ?? []) as Array<{ id: string; preferred_name: string; role: Role }>,
  );
  const actorIsOwner = canForceCycle(member.role);

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
  const nextLabel = open && yearMonth
    ? capsuleTitle(monthLabel(yearMonth), version ?? 1)
    : nextOpenDate;

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
                  </>
                ) : (
                  <>
                    <h2 className="serif" style={{ fontSize: "1.5rem" }}>
                      {GROUP_FIRST_CAPSULE_HEADING}
                    </h2>
                    <p className="muted tiny">{GROUP_NO_PREVIOUS_CAPSULES}</p>
                  </>
                )}
              </div>

              {open && myStatus === "submitted" ? (
                <div className="row" style={{ justifyContent: "center" }}>
                  <PendingLink className="btn btn--secondary" href={`/g/${uuid}/submit`} pendingLabel="Opening…">
                    {GROUP_PRIMARY_EDIT}
                  </PendingLink>
                </div>
              ) : open ? (
                <>
                  <PendingLink
                    className="btn btn--primary btn--block btn--lg"
                    href={`/g/${uuid}/submit`}
                    pendingLabel="Opening…"
                  >
                    {myStatus === "draft" ? "Continue your draft" : GROUP_PRIMARY_SUBMIT}
                  </PendingLink>
                  <p className="btn-note">You can keep editing until the window closes.</p>
                </>
              ) : latestCapsule ? (
                <>
                  <PendingLink
                    className="btn btn--primary btn--block btn--lg"
                    href={capsuleHref(uuid, latestCapsule.yearMonth, latestCapsule.version)}
                    pendingLabel="Opening…"
                    prefetch={false}
                  >
                    {GROUP_PRIMARY_VIEW}
                  </PendingLink>
                </>
              ) : null}
            </div>
          </div>

          <CycleForm
            groupId={group.id}
            submitOpen={open}
            unsent={unsent}
            thisMonthLabel={nextLabel}
            writtenPhrase={open ? writtenCountPhrase(written, total) : undefined}
            nextOpenDate={nextOpenDate}
            canForce={actorIsOwner}
          />

          <div className="stack stack--tight">
            <p className="eyebrow">{GROUP_PEOPLE_HEADING}</p>
            <ul className="list">
              {people.map((person) => {
                const bits = [
                  person.id === member.id ? "You" : null,
                  person.role === "owner" ? "started the group" : null,
                ].filter(Boolean);
                const showKick =
                  actorIsOwner &&
                  canKickMember({
                    actorRole: member.role,
                    actorMemberId: member.id,
                    targetRole: person.role,
                    targetMemberId: person.id,
                  });
                return (
                  <li key={person.id}>
                    <div className="listitem listitem--actions">
                      <span className="avatar">{initials(person.preferred_name)}</span>
                      <span className="listitem__body">
                        <span className="listitem__title">{person.preferred_name}</span>
                        {bits.length > 0 ? (
                          <span className="listitem__meta">{bits.join(" · ")}</span>
                        ) : null}
                      </span>
                      {showKick ? <KickMemberForm groupId={uuid} memberId={person.id} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {earlier.length > 0 ? (
            <div className="stack stack--tight">
              <p className="eyebrow">{GROUP_EARLIER_CAPSULES}</p>
              <ul className="list">
                {earlier.map((row) => (
                  <li key={`${row.yearMonth}-${row.version}`}>
                    <Link
                      className="listitem"
                      href={capsuleHref(uuid, row.yearMonth, row.version)}
                      prefetch={false}
                    >
                      <span className="listitem__body">
                        <span className="listitem__title">
                          {earlierCapsuleTitle(
                            monthLabel(row.yearMonth),
                            row.version,
                            closedCountForMonth(compiled, row.yearMonth),
                          )}
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

          {member.account_id ? null : (
            <SaveLoginForm groupId={uuid} next={`/g/${uuid}`} error={error} />
          )}
        </div>
      </div>
    </main>
  );
}
