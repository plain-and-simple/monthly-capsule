import Link from "next/link";
import { groupDisplayName } from "@/lib/copy";
import { initials } from "@/lib/group-status";
import { ROSTER_SELECT, toRoster } from "@/lib/manage";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group, member } = await requireGroupMember(uuid);
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select(ROSTER_SELECT)
    .eq("group_id", uuid)
    .order("joined_at", { ascending: true });

  const people = toRoster(
    (data ?? []) as Array<{ id: string; preferred_name: string; role: Role }>,
  );
  const name = groupDisplayName(group.name);

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <Link href={`/g/${uuid}`} className="backlink">
              ← {name}
            </Link>
            <h1>People</h1>
            <p className="muted small">
              {people.length} in {name}.
            </p>
          </div>

          <ul className="list">
            {people.map((person) => {
              const bits = [
                person.id === member.id ? "You" : null,
                person.role === "owner" ? "started the group" : null,
              ].filter(Boolean);
              return (
                <li key={person.id}>
                  <div className="listitem">
                    <span className="avatar">{initials(person.preferred_name)}</span>
                    <span className="listitem__body">
                      <span className="listitem__title">{person.preferred_name}</span>
                      {bits.length > 0 ? (
                        <span className="listitem__meta">{bits.join(" · ")}</span>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="row">
            <Link className="btn btn--secondary" href={`/g/${uuid}/invite`}>
              Invite someone
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
