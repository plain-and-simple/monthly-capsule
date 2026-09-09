import { describe, expect, it } from "vitest";
import {
  chicagoDate,
  compileTargetYearMonth,
  emailTargetYearMonth,
  isSubmitOpen,
  incrementYearMonth,
  nextYearMonth,
  previousYearMonth,
  validateSchedule,
  yearMonthString,
} from "./schedule";

const schedule = {
  submit_start_day: 1,
  submit_end_day: 8,
  email_day: 9,
};

// 2026-09 is CDT (UTC−5)
const chicago = (isoUtc: string) => new Date(isoUtc);

describe("validateSchedule", () => {
  it("accepts defaults", () => {
    expect(validateSchedule(1, 8, 9)).toBeNull();
  });

  it("accepts same start and end", () => {
    expect(validateSchedule(5, 5, 6)).toBeNull();
  });

  it("rejects end >= email day", () => {
    expect(validateSchedule(1, 9, 9)).toBeTruthy();
    expect(validateSchedule(1, 10, 9)).toBeTruthy();
  });

  it("rejects start after end", () => {
    expect(validateSchedule(8, 1, 9)).toBeTruthy();
  });

  it("rejects days outside 1–28", () => {
    expect(validateSchedule(0, 8, 9)).toBeTruthy();
    expect(validateSchedule(1, 8, 29)).toBeTruthy();
  });

  it("rejects non-integers", () => {
    expect(validateSchedule(1.5, 8, 9)).toBeTruthy();
  });
});

describe("chicagoDate", () => {
  it("reads America/Chicago, not UTC", () => {
    // 2026-09-09 00:30 CDT = 2026-09-09 05:30 UTC
    const date = chicagoDate(chicago("2026-09-09T05:30:00Z"));
    expect(date).toEqual({ year: 2026, month: 9, day: 9 });
  });

  it("stays on the previous Chicago day before midnight", () => {
    // 2026-09-08 23:30 CDT = 2026-09-09 04:30 UTC
    const date = chicagoDate(chicago("2026-09-09T04:30:00Z"));
    expect(date).toEqual({ year: 2026, month: 9, day: 8 });
  });
});

describe("isSubmitOpen", () => {
  it("is open on start and end days", () => {
    expect(isSubmitOpen(schedule, chicago("2026-09-01T17:00:00Z"))).toBe(true);
    expect(isSubmitOpen(schedule, chicago("2026-09-08T17:00:00Z"))).toBe(true);
  });

  it("is closed after submit_end_day", () => {
    expect(isSubmitOpen(schedule, chicago("2026-09-09T05:30:00Z"))).toBe(false);
  });

  it("is closed before submit_start_day", () => {
    const late = { submit_start_day: 10, submit_end_day: 15, email_day: 16 };
    expect(isSubmitOpen(late, chicago("2026-09-08T17:00:00Z"))).toBe(false);
  });
});

describe("compile and email targets", () => {
  it("compiles previous month while the window is still open", () => {
    expect(compileTargetYearMonth(schedule, chicago("2026-09-08T17:00:00Z"))).toBe(
      "2026-08",
    );
  });

  it("compiles current month after submit_end_day", () => {
    expect(compileTargetYearMonth(schedule, chicago("2026-09-09T05:30:00Z"))).toBe(
      "2026-09",
    );
  });

  it("emails previous month before email_day", () => {
    expect(emailTargetYearMonth(schedule, chicago("2026-09-08T17:00:00Z"))).toBe(
      "2026-08",
    );
  });

  it("emails current month on email_day", () => {
    expect(emailTargetYearMonth(schedule, chicago("2026-09-09T17:00:00Z"))).toBe(
      "2026-09",
    );
  });

  it("rolls year on January compile catch-up", () => {
    expect(previousYearMonth({ year: 2027, month: 1, day: 3 })).toBe("2026-12");
    expect(yearMonthString({ year: 2026, month: 1, day: 1 })).toBe("2026-01");
    expect(nextYearMonth({ year: 2026, month: 12, day: 20 })).toBe("2027-01");
    expect(incrementYearMonth("2026-09")).toBe("2026-10");
  });
});
