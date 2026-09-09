import {
  chicagoDate,
  compileTargetYearMonth,
  incrementYearMonth,
  parseYearMonth,
  yearMonthString,
  type ScheduleDays,
} from "@/lib/schedule";

export type CycleGroup = ScheduleDays & {
  force_open_year_month: string | null;
};

export const CYCLE_ALREADY_OPEN = "Already open.";
export const CYCLE_OWNER_ONLY = "Owner only.";
export const CYCLE_CONFIRM_CLOSE = "Confirm to close.";
export const CYCLE_OPENED = "Opened.";
export const CYCLE_COMPILED = "Capsule ready.";
export const CYCLE_EMAIL_PROMPT = "Email the group?";
export const CYCLE_SENT = "Sent.";
export const CYCLE_ALREADY_SENT = "Already sent.";
export const CYCLE_SKIPPED = "Not now.";
export const CYCLE_NO_CAPSULE = "No capsule yet.";

export function forceOpenStillActive(
  forceYearMonth: string,
  schedule: Pick<ScheduleDays, "submit_end_day">,
  now: Date = new Date(),
): boolean {
  const parsed = parseYearMonth(forceYearMonth);
  if (!parsed) return false;
  const date = chicagoDate(now);
  if (date.year !== parsed.year) {
    return date.year < parsed.year;
  }
  if (date.month !== parsed.month) {
    return date.month < parsed.month;
  }
  return date.day <= schedule.submit_end_day;
}

/**
 * Calendar month that would next go closed → open.
 * Walks forward past compiled/closed months (no duplicate month).
 */
export function nextClosedToOpenYearMonth(
  schedule: ScheduleDays,
  closedYearMonths: readonly string[],
  now: Date = new Date(),
): string {
  const date = chicagoDate(now);
  const closed = new Set(closedYearMonths);
  let yearMonth =
    date.day <= schedule.submit_end_day ? yearMonthString(date) : incrementYearMonth(yearMonthString(date));

  let guard = 0;
  while (closed.has(yearMonth) && guard < 24) {
    yearMonth = incrementYearMonth(yearMonth);
    guard += 1;
  }
  return yearMonth;
}

/**
 * Year-month members may submit to, or null when the window is shut.
 * Force-open wins while that month is still active and not compiled.
 * A compiled/closed current month does not reopen on calendar days.
 */
export function openSubmitYearMonth(
  group: CycleGroup,
  closedYearMonths: readonly string[],
  now: Date = new Date(),
): string | null {
  const date = chicagoDate(now);
  const current = yearMonthString(date);
  const closed = new Set(closedYearMonths);
  const forceYM = group.force_open_year_month;

  if (forceYM && !closed.has(forceYM) && forceOpenStillActive(forceYM, group, now)) {
    return forceYM;
  }

  if (
    date.day >= group.submit_start_day &&
    date.day <= group.submit_end_day &&
    !closed.has(current)
  ) {
    return current;
  }

  return null;
}

export function isCycleSubmitOpen(
  group: CycleGroup,
  closedYearMonths: readonly string[],
  now: Date = new Date(),
): boolean {
  return openSubmitYearMonth(group, closedYearMonths, now) !== null;
}

/** Close the open window if any; otherwise the cron compile target. */
export function forceCloseYearMonth(
  group: CycleGroup,
  closedYearMonths: readonly string[],
  now: Date = new Date(),
): string {
  return openSubmitYearMonth(group, closedYearMonths, now) ?? compileTargetYearMonth(group, now);
}

export type ForceOpenDecision = "ok" | "already_open" | "forbidden";
export type ForceCloseDecision = "ok" | "forbidden" | "unconfirmed";
export type ForceEmailDecision = "send" | "already_sent" | "forbidden" | "no_capsule";
export type ForceSkipDecision = "hold" | "already_sent" | "forbidden" | "no_capsule";

export function decideForceOpen(role: string, alreadyOpen: boolean): ForceOpenDecision {
  if (role !== "owner") return "forbidden";
  if (alreadyOpen) return "already_open";
  return "ok";
}

export function decideForceClose(role: string, confirmed: boolean): ForceCloseDecision {
  if (role !== "owner") return "forbidden";
  if (!confirmed) return "unconfirmed";
  return "ok";
}

export function decideForceEmail(
  role: string,
  capsule: { email_sent_at: string | null } | null,
): ForceEmailDecision {
  if (role !== "owner") return "forbidden";
  if (!capsule) return "no_capsule";
  if (capsule.email_sent_at) return "already_sent";
  return "send";
}

export function decideForceSkip(
  role: string,
  capsule: { email_sent_at: string | null } | null,
): ForceSkipDecision {
  if (role !== "owner") return "forbidden";
  if (!capsule) return "no_capsule";
  if (capsule.email_sent_at) return "already_sent";
  return "hold";
}
