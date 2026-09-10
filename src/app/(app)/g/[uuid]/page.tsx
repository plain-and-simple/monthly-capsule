import Link from "next/link";
import { GroupChrome } from "@/components/group-chrome";
import { SaveLoginForm } from "@/components/save-login-form";
import {
  GROUP_EARLIER_CAPSULES,
  GROUP_PRIMARY_EDIT,
  GROUP_PRIMARY_SUBMIT,
  GROUP_PRIMARY_VIEW,
} from "@/lib/copy";
import { groupDisplayName } from "@/lib/copy";
import { nextOpenPhrase, windowClosesPhrase } from "@/lib/group-status";
import { resolveSubmitWindow } from "@/lib/cycle-store";
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
  const { open, yearMonth } = await resolveSubmitWindow(group);
  const admin = createAdminClient();
  const name = groupDisplayName(group.name);

  const [{ count }, { data: compiledMonths }] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid),
    admin
      .from("months")
      .select("id, year_month")
      .eq("group_id", uuid)
      .eq("status", "compiled")
      .order("year_month", { ascending: false }),
  ]);

  const total = count ?? 0;
  const latestCapsule = compiledMonths?.[0]?.year_month as string | undefined;
  const earlier = (compiledMonths ?? []).slice(1);

  let myStatus: "none" | "draft" | "submitted" = "none";
  let written = 0;
  if (yearMonth) {
    const { data: month } = await admin
      .from("months")
      .select("id")
      .eq("group_id", uuid)
      .eq("year_month", yearMonth)
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

  const featuredMonth = open ? yearMonth : latestCapsule;
  const closes = featuredMonth ? windowClosesPhrase(featuredMonth, group.submit_end_day) : "";
  const nextOpen = featuredMonth
    ? nextOpenPhrase(featuredMonth, group.submit_start_day)
    : `the ${group.submit_start_day}`;

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <Link className="backlink" href="/manage">
              ← Your groups
            </Link>
            <div className="row row--between">
              <h1>{name}</h1>
              <span className={open ? "badge badge--open" : "badge badge--closed"}>
                <span className="dot" />
                {open ? "Open" : "Closed"}
              </span>
            </div>
          </div>

          <div className={`card card--pad-lg${myStatus === "submitted" && open ? " center" : ""}`}>
            <div className="stack">
              <div className="stack stack--tight">
                <p className="eyebrow">{featuredMonth ? monthLabel(featuredMonth) : name}</p>
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
                      The {monthLabel(latestCapsule)} capsule is ready
                    </h2>
                    <p className="muted small">Writing opens again on {nextOpen}.</p>
                  </>
                ) : (
                  <>
                    <h2 className="serif" style={{ fontSize: "1.5rem" }}>
                      Resting
                    </h2>
                    <p className="muted small">Writing opens again on {nextOpen}.</p>
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
                    href={`/g/${uuid}/capsule/${latestCapsule}`}
                  >
                    {GROUP_PRIMARY_VIEW}
                  </Link>
                  <p className="btn-note">Writing opens again on {nextOpen}.</p>
                </>
              ) : null}
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
                  <li key={row.year_month}>
                    <Link className="listitem" href={`/g/${uuid}/capsule/${row.year_month}`}>
                      <span className="listitem__body">
                        <span className="listitem__title">{monthLabel(row.year_month)}</span>
                      </span>
                      <span className="listitem__end">Read</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <hr className="rule" />

          <div className="stack">
            <GroupChrome uuid={uuid} role={member.role} />
            {open && latestCapsule ? (
              <p className="small muted">
                Last month:{" "}
                <Link href={`/g/${uuid}/capsule/${latestCapsule}`}>
                  the {monthLabel(latestCapsule)} capsule
                </Link>
              </p>
            ) : null}
          </div>

          {member.account_id ? null : <SaveLoginForm groupId={uuid} />}
        </div>
      </div>
    </main>
  );
}
