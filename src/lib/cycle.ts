import {
  chicagoDate,
  compileTargetYearMonth,
  parseYearMonth,
  yearMonthString,
  type ScheduleDays,
} from "@/lib/schedule";
import {
  DEFAULT_MONTH_VERSION,
  latestEdition,
  openEdition,
  type CycleMonthRow,
} from "@/lib/month-version";

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
export const CYCLE_VERSION_CAP = "This month cannot take another version.";

export type CycleTarget = {
  yearMonth: string;
  version: number;
};

/**
 * Owner force-open stays active for that Chicago calendar month,
 * including days after submit_end_day (mid-month writing / re-open).
 */
export function forceOpenStillActive(
  forceYearMonth: string,
  _schedule?: Pick<ScheduleDays, "submit_end_day">,
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
  return true;
}

/**
 * Force-open always targets this Chicago calendar month.
 * Same-month compiled editions become v2+; we do not walk to next month.
 */
export function forceOpenYearMonth(now: Date = new Date()): string {
  return yearMonthString(chicagoDate(now));
}

/** @deprecated Use forceOpenYearMonth — kept so older tests/callers compile during the rename. */
export function nextClosedToOpenYearMonth(
  _schedule: ScheduleDays,
  _closedYearMonths: readonly string[],
  now: Date = new Date(),
): string {
  return forceOpenYearMonth(now);
}

/**
 * Year-month members may submit to, or null when the window is shut.
 * Force-open wins for that Chicago month even if an earlier edition is compiled.
 * Calendar days never reopen a compiled/closed month (that takes force-open → v2).
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

  if (forceYM && forceOpenStillActive(forceYM, group, now)) {
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

export function forceCloseTarget(
  group: CycleGroup,
  rows: readonly CycleMonthRow[],
  closedYearMonths: readonly string[],
  now: Date = new Date(),
): CycleTarget {
  const yearMonth = forceCloseYearMonth(group, closedYearMonths, now);
  const open = openEdition(rows, yearMonth);
  if (open) return { yearMonth, version: open.version };
  const latest = latestEdition(rows, yearMonth);
  return { yearMonth, version: latest?.version ?? DEFAULT_MONTH_VERSION };
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
