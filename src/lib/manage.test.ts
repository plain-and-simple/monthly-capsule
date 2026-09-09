import { describe, expect, it } from "vitest";
import { PRODUCTION_ORIGIN } from "./hosting";
import {
  JOIN_RATE_LIMITED,
  JOIN_WRONG_PIN,
  ROSTER_SELECT,
  canAccessInvite,
  canAccessPeople,
  canAccessSettings,
  canRegeneratePin,
  groupChromeLinks,
  invitePayload,
  payloadHasPinField,
  pinJoinError,
  pinJoinOutcome,
  regenPinOnce,
  rosterLeaksPrivate,
  sessionRejoinsGroup,
  toRoster,
} from "./manage";
import { hashPin, verifyPin } from "./pin-crypto";

const groupId = "550e8400-e29b-41d4-a716-446655440000";
const otherGroup = "11111111-1111-4111-8111-111111111111";

describe("manage UI scenarios 1–20", () => {
  it("1. member chrome includes People and Invite", () => {
    expect(groupChromeLinks("member")).toEqual(["people", "invite"]);
  });

  it("2. member chrome hides Settings", () => {
    expect(groupChromeLinks("member")).not.toContain("settings");
    expect(canAccessSettings("member")).toBe(false);
  });

  it("3. owner chrome includes People, Invite, and Settings", () => {
    expect(groupChromeLinks("owner")).toEqual(["people", "invite", "settings"]);
  });

  it("4. any member can open People", () => {
    expect(canAccessPeople("member")).toBe(true);
    expect(canAccessPeople("owner")).toBe(true);
  });

  it("5. any member can open Invite", () => {
    expect(canAccessInvite("member")).toBe(true);
    expect(canAccessInvite("owner")).toBe(true);
  });

  it("6. settings is owner only", () => {
    expect(canAccessSettings("owner")).toBe(true);
    expect(canAccessSettings("member")).toBe(false);
  });

  it("7. regenerate PIN is owner only", () => {
    expect(canRegeneratePin("owner")).toBe(true);
    expect(canRegeneratePin("member")).toBe(false);
  });

  it("8. roster privacy: names and role, never email", () => {
    const roster = toRoster([
      {
        id: "m1",
        display_name: "Ada",
        role: "owner",
        email: "ada@example.com",
      },
      {
        id: "m2",
        display_name: "Bess",
        role: "member",
        email: "bess@example.com",
      },
    ]);
    expect(roster).toEqual([
      { id: "m1", display_name: "Ada", role: "owner" },
      { id: "m2", display_name: "Bess", role: "member" },
    ]);
    expect(rosterLeaksPrivate(roster)).toBe(false);
    expect(ROSTER_SELECT).not.toContain("email");
    expect(ROSTER_SELECT).not.toContain("pin");
  });

  it("9. roster never includes pin_hash", () => {
    const roster = toRoster([
      {
        id: "m1",
        display_name: "Ada",
        role: "owner",
        pin_hash: "$2a$12$secret",
      },
    ]);
    expect(roster[0]).not.toHaveProperty("pin_hash");
    expect(rosterLeaksPrivate(roster)).toBe(false);
  });

  it("10. no session means join is required", () => {
    expect(sessionRejoinsGroup(null, groupId)).toBe(false);
  });

  it("11. session rejoin skips join for the same group", () => {
    expect(sessionRejoinsGroup({ memberId: "mem", groupId }, groupId)).toBe(true);
  });

  it("12. a session for another group does not skip this join", () => {
    expect(sessionRejoinsGroup({ memberId: "mem", groupId: otherGroup }, groupId)).toBe(
      false,
    );
  });

  it("13. invite is the join URL only", () => {
    const payload = invitePayload("https://capsule.plainandsimple.app", groupId);
    expect(payload).toEqual({
      shareUrl: `https://capsule.plainandsimple.app/join/${groupId}`,
    });
    expect(Object.keys(payload)).toEqual(["shareUrl"]);
  });

  it("14. invite payload never includes a PIN", () => {
    const payload = invitePayload("https://capsule.plainandsimple.app", groupId);
    expect(payloadHasPinField(payload)).toBe(false);
    expect(payload).not.toHaveProperty("pin");
  });

  it("15. invite URL has no basePath and no /capsule prefix", () => {
    const { shareUrl } = invitePayload(PRODUCTION_ORIGIN, groupId);
    const url = new URL(shareUrl);
    expect(url.pathname).toBe(`/join/${groupId}`);
    expect(url.pathname.startsWith("/capsule")).toBe(false);
  });

  it("16. after regen, the old PIN fails", async () => {
    const oldHash = await hashPin("111111");
    const nextHash = await hashPin("222222");
    expect(await verifyPin("111111", oldHash)).toBe(true);
    expect(await verifyPin("111111", nextHash)).toBe(false);
  });

  it("17. after regen, the new PIN works", async () => {
    const nextHash = await hashPin("222222");
    expect(await verifyPin("222222", nextHash)).toBe(true);
  });

  it("18. regen shows the new PIN once and does not echo the old PIN", () => {
    const shown = regenPinOnce("654321");
    expect(shown).toEqual({ ok: true, pin: "654321" });
    expect(JSON.stringify(shown)).not.toContain("111111");
  });

  it("19. wrong PIN uses the exact join error", () => {
    expect(pinJoinOutcome(false, false)).toBe("wrong_pin");
    expect(pinJoinError("wrong_pin")).toBe(JOIN_WRONG_PIN);
    expect(JOIN_WRONG_PIN).toBe("Wrong PIN.");
  });

  it("20. rate limit wins even if the PIN would match", () => {
    expect(pinJoinOutcome(true, true)).toBe("rate_limited");
    expect(pinJoinError("rate_limited")).toBe(JOIN_RATE_LIMITED);
    expect(JOIN_RATE_LIMITED).toBe("Too many tries. Wait a bit.");
  });
});
