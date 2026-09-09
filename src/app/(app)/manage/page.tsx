import Link from "next/link";
import { logoutAccount } from "@/actions/logout";
import { openManagedGroup } from "@/actions/open-group";
import { listAccountGroups } from "@/lib/memberships";
import { requireAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const account = await requireAccount();
  const groups = await listAccountGroups(account.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl leading-tight">Manage</h1>
        <p className="mt-2 text-muted">{account.preferred_name}</p>
      </div>
      {groups.length === 0 ? (
        <div className="space-y-4">
          <p>No capsules yet.</p>
          <p className="text-muted">
            Have a join link? Open it and enter the PIN. Save a login there so this list can find
            the group.
          </p>
          <Link className="btn btn-ghost" href="/join">
            Join a group
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map(({ group }) => (
            <li key={group.id}>
              <form action={openManagedGroup}>
                <input type="hidden" name="groupId" value={group.id} />
                <button className="btn btn-ghost w-full justify-start" type="submit">
                  {group.name || "Capsule"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={logoutAccount}>
        <button type="submit" className="text-sm text-muted underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
