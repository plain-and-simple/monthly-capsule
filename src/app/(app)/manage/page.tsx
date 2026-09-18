import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { OpenGroupForm } from "@/components/open-group-form";
import {
  JOIN_EXISTING_CTA,
  LANDING_CREATE_CTA,
  MANAGE_EMPTY_HEADING,
  MANAGE_EMPTY_HINT,
  MANAGE_EMPTY_TITLE,
  groupDisplayName,
} from "@/lib/copy";
import { manageGroupActionTag, membershipRoleLabel } from "@/lib/group-status";
import { listAccountGroups } from "@/lib/memberships";
import { openSubmitYearMonth } from "@/lib/cycle";
import { getSession, requireAccount } from "@/lib/session";
import { decideOpenGroupUi } from "@/lib/session-policy";
import { createAdminClient } from "@/lib/supabase";
import type { Group } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const account = await requireAccount();
  const [groups, session] = await Promise.all([
    listAccountGroups(account.id),
    getSession(),
  ]);

  const admin = createAdminClient();
  const groupIds = groups.map(({ group }) => group.id);
  const { data: monthRows } =
    groupIds.length > 0
      ? await admin
          .from("months")
          .select("id, group_id, year_month, status")
          .in("group_id", groupIds)
      : { data: [] };

  const closedByGroup = new Map<string, string[]>();
  const compiledByGroup = new Map<string, string[]>();
  const openMonthByGroup = new Map<string, string>();
  for (const row of monthRows ?? []) {
    const groupId = row.group_id as string;
    const yearMonth = row.year_month as string;
    const status = row.status as string;
    if (status === "closed" || status === "compiled") {
      closedByGroup.set(groupId, [...(closedByGroup.get(groupId) ?? []), yearMonth]);
    }
    if (status === "compiled") {
      compiledByGroup.set(groupId, [...(compiledByGroup.get(groupId) ?? []), yearMonth]);
    }
    if (status === "open") {
      openMonthByGroup.set(groupId, row.id as string);
    }
  }

  const memberIds = groups.map(({ member }) => member.id);
  const openMonthIds = [...openMonthByGroup.values()];
  const statusByMember = new Map<string, "none" | "draft" | "submitted">();
  if (memberIds.length > 0 && openMonthIds.length > 0) {
    const { data: submissions } = await admin
      .from("submissions")
      .select("member_id, month_id, status")
      .in("member_id", memberIds)
      .in("month_id", openMonthIds);
    for (const row of submissions ?? []) {
      const status = row.status === "submitted" ? "submitted" : "draft";
      statusByMember.set(`${row.member_id}:${row.month_id}`, status);
    }
  }

  return (
    <>
      <AppHeader name={account.preferred_name} showSignOut homeHref="/manage" />
      <main className="main">
        <div className="wrap">
          <div className="stack stack--loose">
            <div className="stack stack--tight">
              <h1>{MANAGE_EMPTY_TITLE}</h1>
            </div>

            {groups.length === 0 ? (
              <>
                <div className="empty">
                  <div className="empty__mark" />
                  <div className="stack stack--tight">
                    <h2 className="serif">{MANAGE_EMPTY_HEADING}</h2>
                    <p className="muted small">
                      Groups start one of two ways: someone sends you a link, or you make one.
                    </p>
                  </div>
                </div>
                <div className="stack stack--tight">
                  <Link className="btn btn--primary btn--block" href="/join">
                    {JOIN_EXISTING_CTA}
                  </Link>
                  <Link className="btn btn--secondary btn--block" href="/create">
                    {LANDING_CREATE_CTA}
                  </Link>
                  <p className="btn-note">Creating a group needs a studio code.</p>
                </div>
                <div className="panel">
                  <p className="small">
                    <b>Waiting on an invite?</b>{" "}
                    <span className="muted">
                      {MANAGE_EMPTY_HINT} There is no way to search for a group from here — that is
                      on purpose.
                    </span>
                  </p>
                </div>
              </>
            ) : (
              <>
                <ul className="list">
                  {groups.map(({ group, member }) => {
                    const closed = closedByGroup.get(group.id) ?? [];
                    const compiled = compiledByGroup.get(group.id) ?? [];
                    const submitOpen =
                      openSubmitYearMonth(group as Group, closed, new Date()) !== null;
                    const openMonthId = openMonthByGroup.get(group.id);
                    const myStatus =
                      (openMonthId && statusByMember.get(`${member.id}:${openMonthId}`)) || "none";
                    const name = groupDisplayName(group.name);
                    return (
                      <li key={group.id}>
                        <OpenGroupForm
                          groupId={group.id}
                          open={decideOpenGroupUi({
                            groupId: group.id,
                            memberId: member.id,
                            session,
                          })}
                          name={name}
                          roleLabel={membershipRoleLabel(member.role)}
                          status={manageGroupActionTag({
                            submitOpen,
                            hasCompiledCapsule: compiled.length > 0,
                            myStatus,
                          })}
                        />
                      </li>
                    );
                  })}
                </ul>
                <div className="row">
                  <Link className="btn btn--quiet" href="/join">
                    {JOIN_EXISTING_CTA}
                  </Link>
                  <Link className="btn btn--quiet" href="/create">
                    Create a group
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
