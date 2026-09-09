import type { Role, SessionPayload } from "@/lib/types";

export const JOIN_WRONG_PIN = "Wrong PIN.";
export const JOIN_RATE_LIMITED = "Too many tries. Wait a bit.";

export const ROSTER_SELECT = "id, display_name, role, joined_at";

export type RosterPerson = {
  id: string;
  display_name: string;
  role: Role;
};

export type PinJoinOutcome = "ok" | "wrong_pin" | "rate_limited";

export type GroupChromeLink = "people" | "invite" | "settings";

export function canAccessPeople(role: Role): boolean {
  return role === "member" || role === "owner";
}

export function canAccessInvite(role: Role): boolean {
  return role === "member" || role === "owner";
}

export function canAccessSettings(role: Role): boolean {
  return role === "owner";
}

export function canRegeneratePin(role: Role): boolean {
  return role === "owner";
}

export function groupChromeLinks(role: Role): GroupChromeLink[] {
  const links: GroupChromeLink[] = ["people", "invite"];
  if (canAccessSettings(role)) {
    links.push("settings");
  }
  return links;
}

export function inviteShareUrl(origin: string, groupId: string): string {
  return `${origin.replace(/\/$/, "")}/join/${groupId}`;
}

export function invitePayload(origin: string, groupId: string): { shareUrl: string } {
  return { shareUrl: inviteShareUrl(origin, groupId) };
}

export function payloadHasPinField(payload: object): boolean {
  return Object.keys(payload).some((key) => key.toLowerCase().includes("pin"));
}

export function toRoster(
  members: Array<{
    id: string;
    display_name: string;
    role: Role;
    email?: string | null;
    pin_hash?: string;
  }>,
): RosterPerson[] {
  return members.map(({ id, display_name, role }) => ({ id, display_name, role }));
}

export function rosterLeaksPrivate(people: object[]): boolean {
  return people.some((person) => "email" in person || "pin_hash" in person);
}

export function sessionRejoinsGroup(
  session: SessionPayload | null,
  groupId: string,
): boolean {
  return session?.groupId === groupId;
}

export function pinJoinOutcome(blocked: boolean, matches: boolean): PinJoinOutcome {
  if (blocked) return "rate_limited";
  if (!matches) return "wrong_pin";
  return "ok";
}

export function pinJoinError(outcome: PinJoinOutcome): string | null {
  if (outcome === "rate_limited") return JOIN_RATE_LIMITED;
  if (outcome === "wrong_pin") return JOIN_WRONG_PIN;
  return null;
}

export function regenPinOnce(pin: string): { ok: true; pin: string } {
  return { ok: true, pin };
}
