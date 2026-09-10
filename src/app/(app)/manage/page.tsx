import Link from "next/link";
import { redirect } from "next/navigation";
import { openManagedGroup } from "@/actions/open-group";
import { AppHeader } from "@/components/app-header";
import {
  LANDING_CREATE_CTA,
  MANAGE_EMPTY_HINT,
  MANAGE_EMPTY_TITLE,
  groupDisplayName,
} from "@/lib/copy";
import { decorateManagedGroup, initials } from "@/lib/group-status";
import { listAccountGroups } from "@/lib/memberships";
import { decideManageSolo } from "@/lib/session-policy";
import { requireAccount } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { Group } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const account = await requireAccount();
  const groups = await listAccountGroups(account.id);

  const solo = decideManageSolo(groups.length);
  if (solo.action === "open_via_route") {
    redirect(solo.path);
  }

  const admin = createAdminClient();
  const groupIds = groups.map(({ group }) => group.id);
  const { data: monthRows } =
    groupIds.length > 0
      ? await admin.from("months").select("group_id, year_month, status").in("group_id", groupIds)
      : { data: [] };

  const closedByGroup = new Map<string, string[]>();
  const compiledByGroup = new Map<string, string[]>();
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
  }

  return (
    <>
      <AppHeader name={account.preferred_name} showSignOut homeHref="/manage" />
      <main className="main">
        <div className="wrap">
          <div className="stack stack--loose">
            <div className="stack stack--tight">
              <h1>{MANAGE_EMPTY_TITLE}</h1>
              {groups.length > 0 ? (
                <p className="muted small">
                  {groups.length} {groups.length === 1 ? "group" : "groups"}. Pick one.
                </p>
              ) : null}
            </div>

            {groups.length === 0 ? (
              <>
                <div className="empty">
                  <div className="empty__mark" />
                  <div className="stack stack--tight">
                    <h2 className="serif">Nothing here yet</h2>
                    <p className="muted small">
                      Groups start one of two ways: someone sends you a link, or you make one.
                    </p>
                  </div>
                </div>
                <div className="stack stack--tight">
                  <Link className="btn btn--primary btn--block" href="/create">
                    {LANDING_CREATE_CTA}
                  </Link>
                  <p className="btn-note">Needs a studio code.</p>
                </div>
                <div className="panel">
                  <p className="small">
                    <b>Waiting on an invite?</b>{" "}
                    <span className="muted">{MANAGE_EMPTY_HINT} There is no way to search for a group from here — that is on purpose.</span>
                  </p>
                </div>
              </>
            ) : (
              <>
                <ul className="list">
                  {groups.map(({ group }) => {
                    const decorated = decorateManagedGroup(group as Group, {
                      closedYearMonths: closedByGroup.get(group.id) ?? [],
                      compiledYearMonths: compiledByGroup.get(group.id) ?? [],
                    });
                    const name = groupDisplayName(group.name);
                    return (
                      <li key={group.id}>
                        <form action={openManagedGroup}>
                          <input type="hidden" name="groupId" value={group.id} />
                          <button className="listitem" type="submit">
                            <span className="avatar avatar--lg">{initials(name)}</span>
                            <span className="listitem__body">
                              <span className="listitem__title">{name}</span>
                              <span className="listitem__meta">{decorated.meta}</span>
                            </span>
                            <span className="listitem__end">
                              <span
                                className={
                                  decorated.status === "Open"
                                    ? "badge badge--open"
                                    : decorated.status === "Capsule ready"
                                      ? "badge"
                                      : "badge"
                                }
                              >
                                {decorated.status === "Open" ? <span className="dot" /> : null}
                                {decorated.status}
                              </span>
                            </span>
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
                <div className="row">
                  <Link className="btn btn--quiet" href="/create">
                    Create a group
                  </Link>
                  <span className="muted tiny">Joining still happens by link.</span>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
