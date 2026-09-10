import Link from "next/link";
import { canAccessSettings } from "@/lib/manage";
import type { Role } from "@/lib/types";

export function GroupChrome({ uuid, role }: { uuid: string; role: Role }) {
  return (
    <nav className="quietnav" aria-label="Manage">
      <Link href={`/g/${uuid}/people`}>People</Link>
      <Link href={`/g/${uuid}/invite`}>Invite</Link>
      {canAccessSettings(role) ? <Link href={`/g/${uuid}/settings`}>Settings</Link> : null}
    </nav>
  );
}
