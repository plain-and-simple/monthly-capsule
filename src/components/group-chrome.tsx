import Link from "next/link";
import { canAccessInvite, canAccessSettings } from "@/lib/manage";
import type { Role } from "@/lib/types";

export function GroupChrome({ uuid, role }: { uuid: string; role: Role }) {
  return (
    <nav className="quietnav" aria-label="Group">
      {canAccessInvite(role) ? <Link href={`/g/${uuid}/invite`}>Invite</Link> : null}
      {canAccessSettings(role) ? <Link href={`/g/${uuid}/settings`}>Settings</Link> : null}
    </nav>
  );
}
