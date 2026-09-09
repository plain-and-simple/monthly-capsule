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

/**
 * 1 ≤ start ≤ end ≤ 28 AND end < email_day ≤ 28
 */
export function validateSchedule(
  start: number,
  end: number,
  email: number,
): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(email)) {
    return "Days must be whole numbers.";
  }
  if (!(start >= 1 && start <= end && end <= 28 && end < email && email <= 28)) {
    return "Need 1 ≤ Submit opens ≤ Submit closes ≤ 28 and Submit closes < Email capsule ≤ 28.";
  }
  return null;
}

export function isSubmitOpen(schedule: ScheduleDays, now: Date = new Date()): boolean {
  const { day } = chicagoDate(now);
  return day >= schedule.submit_start_day && day <= schedule.submit_end_day;
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
