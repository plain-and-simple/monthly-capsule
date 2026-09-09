import Link from "next/link";
import { ROSTER_SELECT, toRoster } from "@/lib/manage";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { member } = await requireGroupMember(uuid);
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select(ROSTER_SELECT)
    .eq("group_id", uuid)
    .order("joined_at", { ascending: true });

  const people = toRoster(
    (data ?? []) as Array<{ id: string; preferred_name: string; role: Role }>,
  );

  return (
    <div className="space-y-6">
      <Link href={`/g/${uuid}`} className="text-sm text-muted">
        Back
      </Link>
      <h1 className="font-serif text-4xl leading-tight">People</h1>
      <ul className="space-y-3">
        {people.map((person) => (
          <li key={person.id} className="font-serif text-xl">
            {person.preferred_name}
            {person.role === "owner" ? <span className="text-muted"> · Owner</span> : null}
            {person.id === member.id ? <span className="text-muted"> · you</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
