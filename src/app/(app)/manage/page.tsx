import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAccount } from "@/actions/logout";
import { openManagedGroup } from "@/actions/open-group";
import { SiteHeader } from "@/components/site-header";
import {
  MANAGE_CREATE_LABEL,
  MANAGE_EMPTY_HEADING,
  MANAGE_EMPTY_HINT,
  groupDisplayName,
} from "@/lib/copy";
import { listAccountGroups } from "@/lib/memberships";
import { decideManageSolo } from "@/lib/session-policy";
import { requireAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const account = await requireAccount();
  const groups = await listAccountGroups(account.id);

  const solo = decideManageSolo(groups.length);
  if (solo.action === "open_via_route") {
    redirect(solo.path);
  }

  return (
    <>
      <SiteHeader />
      <div className="space-y-8">
        {groups.length === 0 ? (
          <div className="space-y-5">
            <div>
              <h1 className="font-serif text-4xl font-medium leading-tight">
                {MANAGE_EMPTY_HEADING}
              </h1>
              <p className="mt-2 text-muted">{account.preferred_name}</p>
            </div>
            <Link className="btn" href="/create">
              {MANAGE_CREATE_LABEL}
            </Link>
            <p className="text-muted">{MANAGE_EMPTY_HINT}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="font-serif text-4xl font-medium leading-tight">Manage</h1>
              <p className="mt-2 text-muted">{account.preferred_name}</p>
            </div>
            <ul className="space-y-3">
              {groups.map(({ group }) => (
                <li key={group.id}>
                  <form action={openManagedGroup}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <button className="btn btn-ghost w-full justify-start" type="submit">
                      {groupDisplayName(group.name)}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
        <form action={logoutAccount}>
          <button type="submit" className="text-sm text-muted underline">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
