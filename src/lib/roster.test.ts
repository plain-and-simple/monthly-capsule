import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROSTER_NOT_YET, ROSTER_SUBMITTED } from "./copy";
import { ROSTER_SELECT, toRoster } from "./manage";
import {
  activeRosterMembers,
  isSubmittedThisPeriod,
  periodRoster,
  periodWrittenCount,
  rosterPeriodLabel,
  splitPeriodRoster,
} from "./roster";

const here = dirname(fileURLToPath(import.meta.url));

const people = toRoster([
  { id: "ada", preferred_name: "Ada", role: "owner" },
  { id: "bess", preferred_name: "Bess", role: "member" },
  { id: "cara", preferred_name: "Cara", role: "member" },
  { id: "dee", preferred_name: "Dee", role: "member" },
]);

describe("open-month roster: Submitted vs Not yet", () => {
  it("treats final submit as Submitted and a draft or missing row as Not yet", () => {
    const roster = periodRoster(people, [
      { member_id: "ada", status: "submitted" },
      { member_id: "bess", status: "draft" },
      { member_id: "cara" },
    ]);
    const split = splitPeriodRoster(roster);

    expect(split.submitted.map((row) => row.preferred_name)).toEqual(["Ada", "Cara"]);
    expect(split.notYet.map((row) => row.preferred_name)).toEqual(["Bess", "Dee"]);
    expect(isSubmittedThisPeriod({ status: "submitted" })).toBe(true);
    expect(isSubmittedThisPeriod({ status: "draft" })).toBe(false);
    expect(isSubmittedThisPeriod(undefined)).toBe(false);
    expect(isSubmittedThisPeriod(null)).toBe(false);
    expect(rosterPeriodLabel(true, true)).toBe(ROSTER_SUBMITTED);
    expect(rosterPeriodLabel(false, true)).toBe(ROSTER_NOT_YET);
    expect(rosterPeriodLabel(true, false)).toBeNull();
    expect(rosterPeriodLabel(false, false)).toBeNull();
  });

  it("names only — never letter body or photo paths", () => {
    const roster = periodRoster(people, [
      {
        member_id: "ada",
        status: "submitted",
        body: "SECRET LETTER ABOUT SOUP",
        photo: "groups/x/photos/secret.webp",
      } as { member_id: string; status?: string | null },
      { member_id: "bess", status: "draft" },
    ]);
    const payload = JSON.stringify(roster);
    expect(roster.every((row) => Object.keys(row).sort().join() === "id,preferred_name,role,submitted")).toBe(
      true,
    );
    expect(payload).not.toContain("SECRET");
    expect(payload).not.toContain("soup");
    expect(payload).not.toContain("photos/");
    expect(payload).not.toContain("@");
    expect(ROSTER_SELECT).not.toContain("email");
    expect(ROSTER_SELECT).not.toContain("body");
    expect(ROSTER_SELECT).not.toContain("photo");
  });

  it("excludes kicked and left members", () => {
    const current = activeRosterMembers([
      { id: "ada", preferred_name: "Ada", role: "owner" as const, removed_at: null },
      {
        id: "kicked",
        preferred_name: "Kicked",
        role: "member" as const,
        removed_at: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "left",
        preferred_name: "Left",
        role: "member" as const,
        removed_at: "2026-10-02T12:00:00.000Z",
      },
    ]);
    expect(current.map((row) => row.preferred_name)).toEqual(["Ada"]);

    const split = splitPeriodRoster(
      periodRoster(toRoster(current), [{ member_id: "kicked", status: "submitted" }]),
    );
    expect(split.submitted).toEqual([]);
    expect(split.notYet.map((row) => row.preferred_name)).toEqual(["Ada"]);
    expect(periodWrittenCount(periodRoster(toRoster(current), [
      { member_id: "ada", status: "draft" },
      { member_id: "kicked", status: "submitted" },
      { member_id: "left", status: "submitted" },
    ]))).toEqual({ written: 0, total: 1 });
  });
});

describe("group home roster wiring", () => {
  it("shows Submitted vs Not yet on group home, not on /people, and never loads letters or photos for it", () => {
    const home = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    const peoplePage = readFileSync(resolve(here, "../app/(app)/g/[uuid]/people/page.tsx"), "utf8");
    const rosterUi = readFileSync(resolve(here, "../components/people-roster.tsx"), "utf8");

    expect(home).toContain("PeopleRoster");
    expect(home).toContain("periodRoster");
    expect(home).toContain("periodWrittenCount");
    expect(home).toContain("activeRosterMembers");
    expect(home).toContain('.is("removed_at", null)');
    expect(home).toContain('.select("member_id, status")');
    expect(home).not.toContain(".from(\"photos\")");
    expect(home).not.toMatch(/from\("submissions"\)[\s\S]{0,80}body/);

    expect(rosterUi).toContain("ROSTER_SUBMITTED");
    expect(rosterUi).toContain("ROSTER_NOT_YET");
    expect(rosterUi).toContain("splitPeriodRoster");
    expect(rosterUi).not.toMatch(/(letter|storage_path|photo_urls)/i);

    expect(peoplePage).toContain('redirect(`/g/${uuid}`)');
    expect(peoplePage).not.toContain("Not yet");
    expect(peoplePage).not.toContain("PeopleRoster");
  });
});
