import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_BANNED,
  accountIsBanned,
  membershipIsActive,
  submitBlockedReason,
  SUBMIT_ACCOUNT_REQUIRED,
} from "./account";
import {
  canKickMember,
  kickConfirmAccepted,
  KICK_CONFIRM_VALUE,
  ROSTER_SELECT,
} from "./manage";
import {
  banConfirmAccepted,
  compileGroupIdsFromRows,
  studioAdminLeaksPrivate,
  studioGroupCounts,
  STUDIO_ADMIN_FORBIDDEN_KEYS,
  STUDIO_ADMIN_SELECT_CAPSULES,
  STUDIO_ADMIN_SELECT_GROUPS,
  STUDIO_ADMIN_SELECT_MEMBERS,
  STUDIO_ADMIN_SELECT_MONTHS,
} from "./studio-admin";

const here = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string) {
  return readFileSync(resolve(here, relativePath), "utf8");
}

describe("owner kick", () => {
  it("is owner-only, never self, never the owner seat", () => {
    expect(
      canKickMember({
        actorRole: "owner",
        actorMemberId: "owner-1",
        targetRole: "member",
        targetMemberId: "mem-1",
      }),
    ).toBe(true);
    expect(
      canKickMember({
        actorRole: "member",
        actorMemberId: "mem-2",
        targetRole: "member",
        targetMemberId: "mem-1",
      }),
    ).toBe(false);
    expect(
      canKickMember({
        actorRole: "owner",
        actorMemberId: "owner-1",
        targetRole: "owner",
        targetMemberId: "owner-2",
      }),
    ).toBe(false);
    expect(
      canKickMember({
        actorRole: "owner",
        actorMemberId: "owner-1",
        targetRole: "member",
        targetMemberId: "owner-1",
      }),
    ).toBe(false);
  });

  it("requires confirm before membership ends", () => {
    expect(kickConfirmAccepted(null)).toBe(false);
    expect(kickConfirmAccepted("")).toBe(false);
    expect(kickConfirmAccepted(KICK_CONFIRM_VALUE)).toBe(true);
  });

  it("treats removed_at as the end of membership", () => {
    expect(membershipIsActive({ removed_at: null })).toBe(true);
    expect(membershipIsActive({})).toBe(true);
    expect(membershipIsActive({ removed_at: "2026-09-15T00:00:00.000Z" })).toBe(false);
  });

  it("People shows Remove only for the owner, with confirm", () => {
    const people = source("../app/(app)/g/[uuid]/people/page.tsx");
    expect(people).toContain("KickMemberForm");
    expect(people).toContain("canKickMember");
    expect(people).toContain("actorIsOwner");
    expect(people).toContain('.is("removed_at", null)');
    expect(people).not.toContain("email");

    const form = source("../components/kick-member-form.tsx");
    expect(form).toContain("PEOPLE_REMOVE");
    expect(form).toContain("PEOPLE_REMOVE_CONFIRM");
    expect(form).toContain("KICK_CONFIRM_VALUE");
    expect(form).toContain("setConfirming");

    const action = source("../actions/kick-member.ts");
    expect(action).toContain("requireOwner");
    expect(action).toContain("removed_at");
    expect(action).not.toContain('.from("submissions")');
    expect(action).not.toContain('.from("capsules")');
    expect(action).not.toContain('.from("photos")');
    expect(action).not.toContain(".delete(");
  });
});

describe("account ban", () => {
  it("is account-level and blocks submit when banned_at is set", () => {
    expect(accountIsBanned(null)).toBe(false);
    expect(accountIsBanned({ banned_at: null })).toBe(false);
    expect(accountIsBanned({ banned_at: "2026-09-15T00:00:00.000Z" })).toBe(true);
    expect(submitBlockedReason({ account_id: "acct-1" })).toBeNull();
    expect(
      submitBlockedReason({ account_id: "acct-1" }, { banned_at: "2026-09-15T00:00:00.000Z" }),
    ).toBe(ACCOUNT_BANNED);
    expect(submitBlockedReason({ account_id: null })).toBe(SUBMIT_ACCOUNT_REQUIRED);
    expect(ACCOUNT_BANNED).toBe("This account is not allowed.");
  });

  it("fails Manage login, submit, create, and join", () => {
    const login = source("./session-open.ts");
    expect(login).toContain("accountIsBanned");
    expect(login).toContain("ACCOUNT_BANNED");
    expect(login).toContain("planManageLogin");
    expect(login).toContain("planJoinGroup");

    const submit = source("../actions/submit.ts");
    expect(submit).toContain("submitBlockedReason");
    expect(submit).toContain("findAccountById");
    expect(submit).toContain("membershipIsActive");

    const create = source("../actions/create-group.ts");
    expect(create).toContain("accountIsBanned");
    expect(create).toContain("ACCOUNT_BANNED");

    const auth = source("./memberships.ts");
    expect(auth).toContain("accountIsBanned(account)");
    expect(auth).toContain("banAccountByEmail");
  });
});

describe("studio admin counts", () => {
  it("counts groups, members, and compiles without private fields", () => {
    const monthA = "month-a";
    const monthB = "month-b";
    const rows = studioGroupCounts({
      groups: [
        { id: "g1", name: "Ada's" },
        { id: "g2", name: "" },
      ],
      memberGroupIds: ["g1", "g1", "g2"],
      compileGroupIds: compileGroupIdsFromRows({
        months: [
          { id: monthA, group_id: "g1" },
          { id: monthB, group_id: "g1" },
        ],
        capsules: [{ month_id: monthA }, { month_id: monthB }],
      }),
    });
    expect(rows).toEqual([
      { groupId: "g1", groupName: "Ada's", memberCount: 2, compileCount: 2 },
      { groupId: "g2", groupName: "Untitled group", memberCount: 1, compileCount: 0 },
    ]);
    expect(rows.every((row) => !studioAdminLeaksPrivate(row))).toBe(true);
    expect(STUDIO_ADMIN_FORBIDDEN_KEYS).toEqual(
      expect.arrayContaining(["email", "body", "photos", "storage_path", "html", "archive"]),
    );
  });

  it("gates /admin with the studio code and never selects letters, photos, or emails", () => {
    expect(STUDIO_ADMIN_SELECT_GROUPS).toBe("id, name");
    expect(STUDIO_ADMIN_SELECT_MEMBERS).toBe("group_id");
    expect(STUDIO_ADMIN_SELECT_MONTHS).toBe("id, group_id");
    expect(STUDIO_ADMIN_SELECT_CAPSULES).toBe("month_id");
    expect(STUDIO_ADMIN_SELECT_GROUPS).not.toContain("email");
    expect(STUDIO_ADMIN_SELECT_MEMBERS).not.toContain("email");

    const store = source("./studio-admin-store.ts");
    expect(store).toContain("STUDIO_ADMIN_SELECT_GROUPS");
    expect(store).toContain('.is("removed_at", null)');
    expect(store).not.toContain("submissions");
    expect(store).not.toContain("photos");
    expect(store).not.toContain("archive");
    expect(store).not.toContain("password_hash");

    const page = source("../app/(app)/admin/page.tsx");
    expect(page).toContain("StudioGateForm");
    expect(page).toContain("getStudioSession");
    expect(page).toContain("STUDIO_ADMIN_MEMBERS");
    expect(page).toContain("STUDIO_ADMIN_COMPILES");
    expect(page).toContain("StudioBanForm");
    expect(page).not.toContain("submissions");
    expect(page).not.toContain("photos");
    expect(page).not.toContain("preferred_name");

    const gate = source("../components/studio-gate-form.tsx");
    expect(gate).toContain("STUDIO_PATH");
    expect(gate).toContain("studio_code");

    expect(banConfirmAccepted("1")).toBe(true);
    expect(banConfirmAccepted("")).toBe(false);

    expect(ROSTER_SELECT).not.toContain("email");
  });
});
