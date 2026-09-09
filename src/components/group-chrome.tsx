import Link from "next/link";
import { canAccessSettings } from "@/lib/manage";
import type { Role } from "@/lib/types";

export function GroupChrome({ uuid, role }: { uuid: string; role: Role }) {
  return (
    <nav className="flex flex-wrap gap-3" aria-label="Manage">
      <Link className="btn btn-ghost" href={`/g/${uuid}/people`}>
        People
      </Link>
      <Link className="btn btn-ghost" href={`/g/${uuid}/invite`}>
        Invite
      </Link>
      {canAccessSettings(role) ? (
        <Link className="btn btn-ghost" href={`/g/${uuid}/settings`}>
          Settings
        </Link>
      ) : null}
    </nav>
  );
}
