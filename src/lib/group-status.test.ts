import { describe, expect, it } from "vitest";
import {
  GROUP_STATUS_OPEN,
  GROUP_STATUS_READY,
  GROUP_STATUS_RESTING,
  decorateManagedGroup,
  initials,
  manageGroupStatus,
  membershipRoleLabel,
  nextOpenDateLabel,
  nextOpenPhrase,
  shortMonthDay,
  shortMonthDayYear,
  windowClosesPhrase,
} from "./group-status";

const group = {
  submit_start_day: 1,
  submit_end_day: 8,
  email_day: 9,
  force_open_year_month: null as string | null,
};

describe("manage group status", () => {
  it("labels Open / Capsule ready / Resting", () => {
    expect(
      manageGroupStatus({
        submitOpen: true,
        latestClosedYearMonth: "2026-08",
        compiledYearMonths: ["2026-08"],
      }),
    ).toBe(GROUP_STATUS_OPEN);
    expect(
      manageGroupStatus({
        submitOpen: false,
        latestClosedYearMonth: "2026-09",
        compiledYearMonths: ["2026-09"],
      }),
    ).toBe(GROUP_STATUS_READY);
    expect(
      manageGroupStatus({
        submitOpen: false,
        latestClosedYearMonth: "2026-09",
        compiledYearMonths: ["2026-08"],
      }),
    ).toBe(GROUP_STATUS_RESTING);
  });

  it("decorates an open September window", () => {
    const row = decorateManagedGroup(group, {
      closedYearMonths: [],
      compiledYearMonths: [],
      now: new Date("2026-09-04T17:00:00Z"),
    });
    expect(row.status).toBe(GROUP_STATUS_OPEN);
    expect(row.meta).toMatch(/Open until/);
    expect(row.meta).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("decorates a compiled closed month as Capsule ready", () => {
    const row = decorateManagedGroup(group, {
      closedYearMonths: ["2026-09"],
      compiledYearMonths: ["2026-09"],
      now: new Date("2026-09-10T17:00:00Z"),
    });
    expect(row.status).toBe(GROUP_STATUS_READY);
    expect(row.meta).toMatch(/September 2026 capsule is ready to read/);
  });

  it("keeps the resting meta on a short date with no year", () => {
    const row = decorateManagedGroup(group, {
      closedYearMonths: [],
      compiledYearMonths: [],
      now: new Date("2026-09-10T17:00:00Z"),
    });
    expect(row.status).toBe(GROUP_STATUS_RESTING);
    expect(row.meta).toBe("Opens Oct 1");
    expect(row.meta).not.toMatch(/2026|2027/);
    expect(shortMonthDay("2026-10", 1)).toBe("Oct 1");
  });
});

describe("next open date label", () => {
  it("rolls to the next month once the start day has passed", () => {
    expect(nextOpenDateLabel(group, [], new Date("2026-09-10T17:00:00Z"))).toBe("Oct 1, 2026");
  });

  it("stays in the current month when the start day is still ahead", () => {
    expect(
      nextOpenDateLabel({ ...group, submit_start_day: 20 }, [], new Date("2026-09-10T17:00:00Z")),
    ).toBe("Sep 20, 2026");
  });

  it("rolls the year over in December", () => {
    expect(nextOpenDateLabel(group, [], new Date("2026-12-15T18:00:00Z"))).toBe("Jan 1, 2027");
  });

  it("skips a closed current month even before the start day", () => {
    expect(
      nextOpenDateLabel(
        { ...group, submit_start_day: 20 },
        ["2026-09"],
        new Date("2026-09-10T17:00:00Z"),
      ),
    ).toBe("Oct 20, 2026");
  });

  it("formats a short month, day, and year", () => {
    expect(shortMonthDayYear("2026-10", 1)).toBe("Oct 1, 2026");
    expect(shortMonthDayYear("2027-01", 9)).toBe("Jan 9, 2027");
  });
});

describe("plain-language dates", () => {
  it("says Friday the 25th for a Chicago calendar day", () => {
    expect(windowClosesPhrase("2026-09", 25)).toBe("Friday the 25th");
    expect(nextOpenPhrase("2026-09", 10)).toBe("October 10");
  });

  it("builds initials from a preferred name", () => {
    expect(initials("Cedar Street")).toBe("CS");
    expect(initials("Wren")).toBe("W");
    expect(initials("")).toBe("?");
  });
});

describe("manage membership role", () => {
  it("labels owner vs member in a few words", () => {
    expect(membershipRoleLabel("owner")).toBe("Owner");
    expect(membershipRoleLabel("member")).toBe("Member");
  });
});
