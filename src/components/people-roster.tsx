import { KickMemberForm } from "@/components/kick-member-form";
import { GROUP_PEOPLE_HEADING, ROSTER_NOT_YET, ROSTER_SUBMITTED } from "@/lib/copy";
import { initials } from "@/lib/group-status";
import { canKickMember } from "@/lib/manage";
import type { PeriodRosterPerson } from "@/lib/roster";
import { splitPeriodRoster } from "@/lib/roster";
import type { Role } from "@/lib/types";

function PersonRow({
  person,
  viewerId,
  actorRole,
  actorMemberId,
  groupId,
}: {
  person: PeriodRosterPerson;
  viewerId: string;
  actorRole: Role;
  actorMemberId: string;
  groupId: string;
}) {
  const bits = [
    person.id === viewerId ? "You" : null,
    person.role === "owner" ? "started the group" : null,
  ].filter(Boolean);
  const showKick = canKickMember({
    actorRole,
    actorMemberId,
    targetRole: person.role,
    targetMemberId: person.id,
  });

  return (
    <li>
      <div className="listitem listitem--actions">
        <span className="avatar">{initials(person.preferred_name)}</span>
        <span className="listitem__body">
          <span className="listitem__title">{person.preferred_name}</span>
          {bits.length > 0 ? <span className="listitem__meta">{bits.join(" · ")}</span> : null}
        </span>
        {showKick ? <KickMemberForm groupId={groupId} memberId={person.id} /> : null}
      </div>
    </li>
  );
}

function RosterGroup({
  heading,
  people,
  viewerId,
  actorRole,
  actorMemberId,
  groupId,
}: {
  heading?: string;
  people: PeriodRosterPerson[];
  viewerId: string;
  actorRole: Role;
  actorMemberId: string;
  groupId: string;
}) {
  return (
    <section className="stack stack--tight">
      {heading ? <p className="roster-heading">{heading}</p> : null}
      <ul className="list">
        {people.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            viewerId={viewerId}
            actorRole={actorRole}
            actorMemberId={actorMemberId}
            groupId={groupId}
          />
        ))}
      </ul>
    </section>
  );
}

export function PeopleRoster({
  people,
  viewerId,
  actorRole,
  actorMemberId,
  groupId,
  submitOpen,
}: {
  people: PeriodRosterPerson[];
  viewerId: string;
  actorRole: Role;
  actorMemberId: string;
  groupId: string;
  submitOpen: boolean;
}) {
  const split = submitOpen ? splitPeriodRoster(people) : null;

  return (
    <div className="stack stack--tight">
      <p className="eyebrow">{GROUP_PEOPLE_HEADING}</p>
      {split ? (
        <>
          <RosterGroup
            heading={ROSTER_SUBMITTED}
            people={split.submitted}
            viewerId={viewerId}
            actorRole={actorRole}
            actorMemberId={actorMemberId}
            groupId={groupId}
          />
          <RosterGroup
            heading={ROSTER_NOT_YET}
            people={split.notYet}
            viewerId={viewerId}
            actorRole={actorRole}
            actorMemberId={actorMemberId}
            groupId={groupId}
          />
        </>
      ) : (
        <RosterGroup
          people={people}
          viewerId={viewerId}
          actorRole={actorRole}
          actorMemberId={actorMemberId}
          groupId={groupId}
        />
      )}
    </div>
  );
}
