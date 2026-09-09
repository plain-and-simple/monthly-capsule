import Link from "next/link";
import { canAccessSettings } from "@/lib/manage";
import type { Role } from "@/lib/types";

export function GroupChrome({ uuid, role }: { uuid: string; role: Role }) {
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Manage">
      <Link className="link-quiet" href={`/g/${uuid}/people`}>
        People
      </Link>
      <Link className="link-quiet" href={`/g/${uuid}/invite`}>
        Invite
      </Link>
      {canAccessSettings(role) ? (
        <Link className="link-quiet" href={`/g/${uuid}/settings`}>
          Settings
        </Link>
      ) : null}
    </nav>
  );
}
