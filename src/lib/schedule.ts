import { CHICAGO_TZ } from "@/lib/constants";

export type ChicagoDate = {
  year: number;
  month: number;
  day: number;
};

export type ScheduleDays = {
  submit_start_day: number;
  submit_end_day: number;
  email_day: number;
};

export function chicagoDate(now: Date = new Date()): ChicagoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
  };
}

export function yearMonthString(date: ChicagoDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}`;
}

export function previousYearMonth(date: ChicagoDate): string {
  if (date.month === 1) {
    return `${date.year - 1}-12`;
  }
  return `${date.year}-${String(date.month - 1).padStart(2, "0")}`;
}

export function nextYearMonth(date: ChicagoDate): string {
  if (date.month === 12) {
    return `${date.year + 1}-01`;
  }
  return `${date.year}-${String(date.month + 1).padStart(2, "0")}`;
}

export function parseYearMonth(yearMonth: string): ChicagoDate | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month, day: 1 };
}

export function incrementYearMonth(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return yearMonth;
  return nextYearMonth(parsed);
}

export function currentYearMonth(now: Date = new Date()): string {
  return yearMonthString(chicagoDate(now));
}

/** Days 20–31 on the open picker are the previous calendar month. */
export const PREVIOUS_MONTH_OPEN_MIN_DAY = 20;
export const SUBMIT_OPEN_DAY_MAX = 31;
/** Close and email_day stay in cycle month M; 28 avoids short-month holes. */
export const CURRENT_MONTH_DAY_MAX = 28;
export const PREVIOUS_MONTH_OPEN_LABEL = "(previous month)";

export function isPreviousMonthOpenDay(day: number): boolean {
  return day >= PREVIOUS_MONTH_OPEN_MIN_DAY;
}

export function openDayOptionLabel(day: number): string {
  if (isPreviousMonthOpenDay(day)) {
    return `${day} ${PREVIOUS_MONTH_OPEN_LABEL}`;
  }
  return String(day);
}

/** Last calendar day of a 1–12 month (UTC date math; month length is timezone-independent). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDayOfMonth(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

export function compareChicagoDate(a: ChicagoDate, b: ChicagoDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * Cycle month M (the capsule `YYYY-MM`):
 * - Open = start of submit_start_day. Days 1–19 are in M; days 20–31 are in
 *   M−1, clamped to that month's last day (Apr 30, Feb 28/29).
 * - Close = end of submit_end_day in M, then compile.
 * - email_day in M = Resend send.
 */
export function cycleOpenChicagoDate(cycleYearMonth: string, startDay: number): ChicagoDate {
  const parsed = parseYearMonth(cycleYearMonth);
  if (!parsed) {
    return { year: 0, month: 1, day: startDay };
  }
  if (isPreviousMonthOpenDay(startDay)) {
    const prev = parseYearMonth(previousYearMonth(parsed));
    if (!prev) {
      return { year: parsed.year, month: parsed.month, day: startDay };
    }
    return {
      year: prev.year,
      month: prev.month,
      day: clampDayOfMonth(prev.year, prev.month, startDay),
    };
  }
  return { year: parsed.year, month: parsed.month, day: startDay };
}

export function cycleCloseChicagoDate(cycleYearMonth: string, endDay: number): ChicagoDate {
  const parsed = parseYearMonth(cycleYearMonth);
  if (!parsed) {
    return { year: 0, month: 1, day: endDay };
  }
  return { year: parsed.year, month: parsed.month, day: endDay };
}

/**
 * Open datetime (start of open day) must be before close datetime (end of
 * close day). Same calendar day is valid: midnight is before that day's end.
 */
export function cycleOpenIsBeforeClose(
  cycleYearMonth: string,
  startDay: number,
  endDay: number,
): boolean {
  const open = cycleOpenChicagoDate(cycleYearMonth, startDay);
  const close = cycleCloseChicagoDate(cycleYearMonth, endDay);
  return compareChicagoDate(open, close) <= 0;
}

export function isCycleWindowOpen(
  cycleYearMonth: string,
  schedule: Pick<ScheduleDays, "submit_start_day" | "submit_end_day">,
  now: Date = new Date(),
): boolean {
  const today = chicagoDate(now);
  const open = cycleOpenChicagoDate(cycleYearMonth, schedule.submit_start_day);
  const close = cycleCloseChicagoDate(cycleYearMonth, schedule.submit_end_day);
  return compareChicagoDate(open, today) <= 0 && compareChicagoDate(today, close) <= 0;
}

export function parseScheduleForm(formData: FormData): ScheduleDays {
  return {
    submit_start_day: Number(formData.get("submit_start_day")),
    submit_end_day: Number(formData.get("submit_end_day")),
    email_day: Number(formData.get("email_day")),
  };
}

export function isCompleteScheduleDays(
  value: Partial<ScheduleDays> | null | undefined,
): value is ScheduleDays {
  return (
    !!value &&
    Number.isInteger(value.submit_start_day) &&
    Number.isInteger(value.submit_end_day) &&
    Number.isInteger(value.email_day)
  );
}

/**
 * Days shown on the owner cycle form. Draft first, then the action result so a
 * successful save is not replaced by a stale cached group snapshot, then group.
 */
export function scheduleFormDays(
  group: ScheduleDays,
  state: Partial<ScheduleDays> | null,
  draft: ScheduleDays | null,
): ScheduleDays {
  if (draft) return draft;
  if (isCompleteScheduleDays(state)) {
    return {
      submit_start_day: state.submit_start_day,
      submit_end_day: state.submit_end_day,
      email_day: state.email_day,
    };
  }
  return {
    submit_start_day: group.submit_start_day,
    submit_end_day: group.submit_end_day,
    email_day: group.email_day,
  };
}

/**
 * Open: 1–31 (20–31 = previous month). Close and email: 1–28 of month M.
 * Chronology compares open/close datetimes, not day-numbers alone, so
 * open 25 (M−1) + close 5 (M) is valid. Same-month open after close is not.
 */
export function validateSchedule(
  start: number,
  end: number,
  email: number,
): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(email)) {
    return "Days must be whole numbers.";
  }
  if (start < 1 || start > SUBMIT_OPEN_DAY_MAX) {
    return "Need 1 ≤ Submit opens ≤ 31. Days 20–31 open the previous month.";
  }
  if (end < 1 || end > CURRENT_MONTH_DAY_MAX || email < 1 || email > CURRENT_MONTH_DAY_MAX) {
    return "Need 1 ≤ Submit closes ≤ 28 and 1 ≤ Email capsule ≤ 28.";
  }
  if (!(end < email)) {
    return "Need Submit closes < Email capsule ≤ 28.";
  }
  // Leap + common year covers Feb 28/29 and 30-day previous months.
  for (const year of [2026, 2028]) {
    for (let month = 1; month <= 12; month += 1) {
      const cycleYearMonth = `${year}-${String(month).padStart(2, "0")}`;
      if (!cycleOpenIsBeforeClose(cycleYearMonth, start, end)) {
        return "Submit opens must be before Submit closes (days 20–31 are the previous month).";
      }
    }
  }
  return null;
}

export function isSubmitOpen(schedule: ScheduleDays, now: Date = new Date()): boolean {
  const current = yearMonthString(chicagoDate(now));
  return (
    isCycleWindowOpen(current, schedule, now) ||
    isCycleWindowOpen(incrementYearMonth(current), schedule, now)
  );
}

/**
 * Compile after submit_end_day ends in America/Chicago.
 * On/before that day, catch up the previous month.
 */
export function compileTargetYearMonth(
  schedule: Pick<ScheduleDays, "submit_end_day">,
  now: Date = new Date(),
): string {
  const date = chicagoDate(now);
  if (date.day > schedule.submit_end_day) {
    return yearMonthString(date);
  }
  return previousYearMonth(date);
}

/**
 * Email on email_day (and later, as catch-up) for the current Chicago month.
 * Before email_day, catch up the previous month.
 */
export function emailTargetYearMonth(
  schedule: Pick<ScheduleDays, "email_day">,
  now: Date = new Date(),
): string {
  const date = chicagoDate(now);
  if (date.day >= schedule.email_day) {
    return yearMonthString(date);
  }
  return previousYearMonth(date);
}

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return yearMonth;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: CHICAGO_TZ,
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}
