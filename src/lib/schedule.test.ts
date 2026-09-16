import { describe, expect, it } from "vitest";
import {
  chicagoDate,
  compileTargetYearMonth,
  cycleCloseChicagoDate,
  cycleOpenChicagoDate,
  cycleOpenIsBeforeClose,
  emailTargetYearMonth,
  isSubmitOpen,
  incrementYearMonth,
  lastDayOfMonth,
  nextYearMonth,
  openDayOptionLabel,
  parseScheduleForm,
  previousYearMonth,
  scheduleFormDays,
  validateSchedule,
  yearMonthString,
} from "./schedule";

const schedule = {
  submit_start_day: 1,
  submit_end_day: 8,
  email_day: 9,
};

const wrap = {
  submit_start_day: 25,
  submit_end_day: 5,
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

  it("accepts previous-month open with an earlier close day-number", () => {
    expect(validateSchedule(25, 5, 9)).toBeNull();
    expect(validateSchedule(20, 1, 2)).toBeNull();
    expect(validateSchedule(31, 1, 2)).toBeNull();
  });

  it("rejects end >= email day", () => {
    expect(validateSchedule(1, 9, 9)).toBeTruthy();
    expect(validateSchedule(1, 10, 9)).toBeTruthy();
  });

  it("rejects same-month open after close even when day-numbers look like wraparound", () => {
    expect(validateSchedule(8, 1, 9)).toBeTruthy();
    expect(validateSchedule(10, 5, 9)).toBeTruthy();
    expect(validateSchedule(19, 5, 9)).toBeTruthy();
  });

  it("rejects close and email outside 1–28", () => {
    expect(validateSchedule(0, 8, 9)).toBeTruthy();
    expect(validateSchedule(1, 8, 29)).toBeTruthy();
    expect(validateSchedule(1, 29, 30)).toBeTruthy();
  });

  it("rejects open outside 1–31", () => {
    expect(validateSchedule(32, 8, 9)).toBeTruthy();
    expect(validateSchedule(0, 8, 9)).toBeTruthy();
  });

  it("rejects non-integers", () => {
    expect(validateSchedule(1.5, 8, 9)).toBeTruthy();
  });
});

describe("scheduleFormDays", () => {
  const group = { submit_start_day: 1, submit_end_day: 8, email_day: 9 };
  const saved = { submit_start_day: 25, submit_end_day: 5, email_day: 9 };

  it("keeps a successful save when the group snapshot is still the old days", () => {
    expect(scheduleFormDays(group, { ok: true, ...saved }, null)).toEqual(saved);
  });

  it("keeps the in-progress draft instead of snapping back to group defaults", () => {
    expect(scheduleFormDays(group, null, saved)).toEqual(saved);
  });

  it("keeps attempted wraparound days when validation fails", () => {
    expect(
      scheduleFormDays(group, { error: "Need Submit closes < Email capsule ≤ 28.", ...saved }, saved),
    ).toEqual(saved);
  });

  it("falls back to the group when nothing has been saved or edited", () => {
    expect(scheduleFormDays(group, null, null)).toEqual(group);
  });

  it("keeps a same-month change (2/8/9) instead of reverting to 1/8/9", () => {
    const next = { submit_start_day: 2, submit_end_day: 8, email_day: 9 };
    expect(scheduleFormDays(group, { ok: true, ...next }, null)).toEqual(next);
  });
});

describe("parseScheduleForm", () => {
  it("reads string day values from the cycle fields", () => {
    const form = new FormData();
    form.set("submit_start_day", "25");
    form.set("submit_end_day", "5");
    form.set("email_day", "9");
    expect(parseScheduleForm(form)).toEqual({
      submit_start_day: 25,
      submit_end_day: 5,
      email_day: 9,
    });
    expect(validateSchedule(25, 5, 9)).toBeNull();
  });

  it("does not treat option labels as values", () => {
    const form = new FormData();
    form.set("submit_start_day", "25 (previous month)");
    form.set("submit_end_day", "5");
    form.set("email_day", "9");
    const days = parseScheduleForm(form);
    expect(Number.isInteger(days.submit_start_day)).toBe(false);
    expect(validateSchedule(days.submit_start_day, days.submit_end_day, days.email_day)).toBeTruthy();
  });
});

describe("cycle open clamp and chronology", () => {
  it("keeps days 1–19 in the cycle month", () => {
    expect(cycleOpenChicagoDate("2026-05", 1)).toEqual({ year: 2026, month: 5, day: 1 });
    expect(cycleOpenChicagoDate("2026-05", 19)).toEqual({ year: 2026, month: 5, day: 19 });
  });

  it("places days 20–31 in the previous month", () => {
    expect(cycleOpenChicagoDate("2026-05", 20)).toEqual({ year: 2026, month: 4, day: 20 });
    expect(cycleOpenChicagoDate("2026-05", 25)).toEqual({ year: 2026, month: 4, day: 25 });
  });

  it("clamps open 31 to the last day of a short previous month", () => {
    expect(lastDayOfMonth(2026, 4)).toBe(30);
    expect(cycleOpenChicagoDate("2026-05", 31)).toEqual({ year: 2026, month: 4, day: 30 });
    expect(cycleOpenChicagoDate("2026-03", 31)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(cycleOpenChicagoDate("2028-03", 31)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("keeps close in the cycle month", () => {
    expect(cycleCloseChicagoDate("2026-05", 5)).toEqual({ year: 2026, month: 5, day: 5 });
  });

  it("treats open 25 previous month + close 5 current month as chronological", () => {
    expect(cycleOpenIsBeforeClose("2026-05", 25, 5)).toBe(true);
    expect(cycleOpenIsBeforeClose("2026-05", 31, 1)).toBe(true);
    expect(cycleOpenIsBeforeClose("2026-05", 10, 5)).toBe(false);
    expect(cycleOpenIsBeforeClose("2026-09", 8, 1)).toBe(false);
  });

  it("labels open picker days 20–31 as previous month", () => {
    expect(openDayOptionLabel(1)).toBe("1");
    expect(openDayOptionLabel(19)).toBe("19");
    expect(openDayOptionLabel(20)).toBe("20 (previous month)");
    expect(openDayOptionLabel(31)).toBe("31 (previous month)");
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

  it("is open in M−1 and in M when open is a previous-month day", () => {
    expect(isSubmitOpen(wrap, chicago("2026-09-24T17:00:00Z"))).toBe(false);
    expect(isSubmitOpen(wrap, chicago("2026-09-25T17:00:00Z"))).toBe(true);
    expect(isSubmitOpen(wrap, chicago("2026-10-03T17:00:00Z"))).toBe(true);
    expect(isSubmitOpen(wrap, chicago("2026-10-05T17:00:00Z"))).toBe(true);
    expect(isSubmitOpen(wrap, chicago("2026-10-06T05:30:00Z"))).toBe(false);
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
