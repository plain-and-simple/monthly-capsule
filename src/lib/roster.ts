import { membershipIsActive } from "@/lib/account";
import { ROSTER_NOT_YET, ROSTER_SUBMITTED } from "@/lib/copy";
import type { RosterPerson } from "@/lib/manage";
import { isIncludedInCapsule } from "@/lib/submit";

export type PeriodRosterPerson = RosterPerson & {
  submitted: boolean;
};

export type PeriodRosterSplit = {
  submitted: PeriodRosterPerson[];
  notYet: PeriodRosterPerson[];
};

/** Current members only. Kick and leave both set `removed_at`. */
export function activeRosterMembers<T extends { removed_at?: string | null }>(
  members: readonly T[],
): T[] {
  return members.filter((member) => membershipIsActive(member));
}

/**
 * Final submit this open period counts. A draft row, or no row, is not yet.
 * Legacy rows with no status still count as submitted (same as capsule include).
 */
export function isSubmittedThisPeriod(
  submission: { status?: string | null } | null | undefined,
): boolean {
  if (!submission) return false;
  return isIncludedInCapsule(submission);
}

export function periodRoster(
  people: readonly RosterPerson[],
  submissions: readonly { member_id: string; status?: string | null }[],
): PeriodRosterPerson[] {
  const byMember = new Map(submissions.map((row) => [row.member_id, row]));
  return people.map((person) => ({
    id: person.id,
    preferred_name: person.preferred_name,
    role: person.role,
    submitted: isSubmittedThisPeriod(byMember.get(person.id)),
  }));
}

export function splitPeriodRoster(people: readonly PeriodRosterPerson[]): PeriodRosterSplit {
  const submitted: PeriodRosterPerson[] = [];
  const notYet: PeriodRosterPerson[] = [];
  for (const person of people) {
    if (person.submitted) submitted.push(person);
    else notYet.push(person);
  }
  return { submitted, notYet };
}

export function rosterPeriodLabel(submitted: boolean, open: boolean): string | null {
  if (!open) return null;
  return submitted ? ROSTER_SUBMITTED : ROSTER_NOT_YET;
}

export function periodWrittenCount(people: readonly PeriodRosterPerson[]): {
  written: number;
  total: number;
} {
  return {
    written: people.filter((person) => person.submitted).length,
    total: people.length,
  };
}
