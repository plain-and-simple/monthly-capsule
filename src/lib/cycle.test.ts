import { describe, expect, it } from "vitest";
import {
  CYCLE_ALREADY_OPEN,
  CYCLE_ALREADY_SENT,
  CYCLE_CONFIRM_CLOSE,
  CYCLE_OWNER_ONLY,
  decideForceClose,
  decideForceEmail,
  decideForceOpen,
  decideForceSkip,
  forceCloseYearMonth,
  forceOpenStillActive,
  isCycleSubmitOpen,
  nextClosedToOpenYearMonth,
  openSubmitYearMonth,
  type CycleGroup,
} from "./cycle";

const schedule: CycleGroup = {
  submit_start_day: 1,
  submit_end_day: 8,
  email_day: 9,
  force_open_year_month: null,
};

const lateStart: CycleGroup = {
  submit_start_day: 10,
  submit_end_day: 15,
  email_day: 16,
  force_open_year_month: null,
};

// 2026-09 is CDT (UTC−5)
const chicago = (isoUtc: string) => new Date(isoUtc);
const duringWindow = chicago("2026-09-05T17:00:00Z"); // Sept 5
const afterWindow = chicago("2026-09-09T05:30:00Z"); // Sept 9
const beforeLateStart = chicago("2026-09-08T17:00:00Z"); // Sept 8, start=10

describe("F1 force open when closed", () => {
  it("targets next month after the window ends, not this calendar month", () => {
    expect(isCycleSubmitOpen(schedule, [], afterWindow)).toBe(false);
    expect(nextClosedToOpenYearMonth(schedule, [], afterWindow)).toBe("2026-10");
  });

  it("targets this month when still waiting for submit_start_day", () => {
    expect(isCycleSubmitOpen(lateStart, [], beforeLateStart)).toBe(false);
    expect(nextClosedToOpenYearMonth(lateStart, [], beforeLateStart)).toBe("2026-09");
  });

  it("lets members submit to the force-opened next period", () => {
    const opened: CycleGroup = { ...schedule, force_open_year_month: "2026-10" };
    expect(openSubmitYearMonth(opened, [], afterWindow)).toBe("2026-10");
    expect(isCycleSubmitOpen(opened, [], afterWindow)).toBe(true);
  });
});

describe("F2 already open — no duplicate month", () => {
  it("is already open in the calendar window", () => {
    expect(isCycleSubmitOpen(schedule, [], duringWindow)).toBe(true);
    expect(openSubmitYearMonth(schedule, [], duringWindow)).toBe("2026-09");
    expect(decideForceOpen("owner", true)).toBe("already_open");
    expect(CYCLE_ALREADY_OPEN).toBe("Already open.");
  });

  it("is already open after a force-open of the next period", () => {
    const opened: CycleGroup = { ...schedule, force_open_year_month: "2026-10" };
    expect(decideForceOpen("owner", isCycleSubmitOpen(opened, [], afterWindow))).toBe(
      "already_open",
    );
  });

  it("skips a compiled month and walks to the next closed→open period", () => {
    expect(nextClosedToOpenYearMonth(schedule, ["2026-09"], duringWindow)).toBe("2026-10");
  });
});

describe("F3 / F7 non-owner reject", () => {
  it("rejects force open", () => {
    expect(decideForceOpen("member", false)).toBe("forbidden");
    expect(CYCLE_OWNER_ONLY).toBe("Owner only.");
  });

  it("rejects force close even if confirmed", () => {
    expect(decideForceClose("member", true)).toBe("forbidden");
    expect(decideForceClose("owner", false)).toBe("unconfirmed");
    expect(CYCLE_CONFIRM_CLOSE).toBe("Confirm to close.");
    expect(decideForceClose("owner", true)).toBe("ok");
  });

  it("rejects email send and skip", () => {
    expect(decideForceEmail("member", { email_sent_at: null })).toBe("forbidden");
    expect(decideForceSkip("member", { email_sent_at: null })).toBe("forbidden");
  });
});

describe("F4 force close compiles the open period", () => {
  it("closes a naturally open month", () => {
    expect(forceCloseYearMonth(schedule, [], duringWindow)).toBe("2026-09");
  });

  it("closes a force-opened next period", () => {
    const opened: CycleGroup = { ...schedule, force_open_year_month: "2026-10" };
    expect(forceCloseYearMonth(opened, [], afterWindow)).toBe("2026-10");
  });

  it("compiles the cron target when already closed (idempotent month)", () => {
    expect(forceCloseYearMonth(schedule, [], afterWindow)).toBe("2026-09");
  });

  it("does not reopen a force-closed month on remaining calendar days", () => {
    expect(openSubmitYearMonth(schedule, ["2026-09"], duringWindow)).toBeNull();
    expect(isCycleSubmitOpen(schedule, ["2026-09"], duringWindow)).toBe(false);
  });
});

describe("F5 / F6 email send vs skip", () => {
  it("owner can send once; already sent blocks a second send", () => {
    expect(decideForceEmail("owner", { email_sent_at: null })).toBe("send");
    expect(decideForceEmail("owner", { email_sent_at: "2026-09-09T12:00:00Z" })).toBe(
      "already_sent",
    );
    expect(CYCLE_ALREADY_SENT).toBe("Already sent.");
  });

  it("Not now holds; missing capsule cannot skip", () => {
    expect(decideForceSkip("owner", { email_sent_at: null })).toBe("hold");
    expect(decideForceSkip("owner", { email_sent_at: "2026-09-09T12:00:00Z" })).toBe(
      "already_sent",
    );
    expect(decideForceEmail("owner", null)).toBe("no_capsule");
    expect(decideForceSkip("owner", null)).toBe("no_capsule");
  });
});

describe("F8 no force — calendar path unchanged", () => {
  it("open/close match isSubmitOpen calendar days", () => {
    expect(isCycleSubmitOpen(schedule, [], duringWindow)).toBe(true);
    expect(isCycleSubmitOpen(schedule, [], afterWindow)).toBe(false);
    expect(isCycleSubmitOpen(lateStart, [], beforeLateStart)).toBe(false);
  });

  it("force-open expires on that month's submit_end_day", () => {
    expect(forceOpenStillActive("2026-10", schedule, afterWindow)).toBe(true);
    expect(forceOpenStillActive("2026-09", schedule, afterWindow)).toBe(false);
    expect(forceOpenStillActive("2026-09", schedule, duringWindow)).toBe(true);
  });
});
