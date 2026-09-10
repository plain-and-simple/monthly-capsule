import { describe, expect, it } from "vitest";
import {
  GROUP_STATUS_OPEN,
  GROUP_STATUS_READY,
  GROUP_STATUS_RESTING,
  decorateManagedGroup,
  initials,
  manageGroupStatus,
  nextOpenPhrase,
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
