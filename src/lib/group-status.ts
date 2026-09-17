import {
  MANAGE_TAG_NOT_OPEN,
  MANAGE_TAG_READ,
  MANAGE_TAG_SUBMIT,
  MANAGE_TAG_SUBMITTED,
  ROLE_MEMBER_LABEL,
  ROLE_OWNER_LABEL,
} from "@/lib/copy";
import { openSubmitYearMonth, type CycleGroup } from "@/lib/cycle";
import { chicagoWeekdayTheDay, monthName, ordinal } from "@/lib/dates";
import type { Role } from "@/lib/types";
import {
  chicagoDate,
  compareChicagoDate,
  compileTargetYearMonth,
  cycleCloseChicagoDate,
  cycleOpenChicagoDate,
  incrementYearMonth,
  monthLabel,
  parseYearMonth,
  yearMonthString,
} from "@/lib/schedule";

export const GROUP_STATUS_OPEN = "Open";
export const GROUP_STATUS_READY = "Capsule ready";
export const GROUP_STATUS_RESTING = "Resting";

export type ManageGroupStatus =
  | typeof GROUP_STATUS_OPEN
  | typeof GROUP_STATUS_READY
  | typeof GROUP_STATUS_RESTING;

export type ManageActionTag =
  | typeof MANAGE_TAG_SUBMIT
  | typeof MANAGE_TAG_SUBMITTED
  | typeof MANAGE_TAG_READ
  | typeof MANAGE_TAG_NOT_OPEN;

export function manageGroupActionTag(input: {
  submitOpen: boolean;
  hasCompiledCapsule: boolean;
  myStatus: "none" | "draft" | "submitted";
}): ManageActionTag {
  if (input.submitOpen) {
    return input.myStatus === "submitted" ? MANAGE_TAG_SUBMITTED : MANAGE_TAG_SUBMIT;
  }
  return input.hasCompiledCapsule ? MANAGE_TAG_READ : MANAGE_TAG_NOT_OPEN;
}

export function membershipRoleLabel(role: Role): string {
  return role === "owner" ? ROLE_OWNER_LABEL : ROLE_MEMBER_LABEL;
}

export function manageGroupStatus(input: {
  submitOpen: boolean;
  latestClosedYearMonth: string | null;
  compiledYearMonths: readonly string[];
}): ManageGroupStatus {
  if (input.submitOpen) return GROUP_STATUS_OPEN;
  if (
    input.latestClosedYearMonth &&
    input.compiledYearMonths.includes(input.latestClosedYearMonth)
  ) {
    return GROUP_STATUS_READY;
  }
  return GROUP_STATUS_RESTING;
}

export function decorateManagedGroup(
  group: CycleGroup,
  input: {
    closedYearMonths: readonly string[];
    compiledYearMonths: readonly string[];
    now?: Date;
  },
): { status: ManageGroupStatus; meta: string } {
  const now = input.now ?? new Date();
  const openYearMonth = openSubmitYearMonth(group, input.closedYearMonths, now);
  const submitOpen = openYearMonth !== null;
  const latestClosedYearMonth = compileTargetYearMonth(group, now);
  const status = manageGroupStatus({
    submitOpen,
    latestClosedYearMonth,
    compiledYearMonths: input.compiledYearMonths,
  });

  if (status === GROUP_STATUS_OPEN && openYearMonth) {
    return {
      status,
      meta: `Open until ${shortMonthDay(openYearMonth, group.submit_end_day)}`,
    };
  }
  if (status === GROUP_STATUS_READY) {
    return {
      status,
      meta: `${monthLabel(latestClosedYearMonth)} capsule is ready to read`,
    };
  }

  return {
    status,
    meta: `Opens ${nextOpenShort(group, now, input.closedYearMonths)}`,
  };
}

/**
 * Next calendar date writing opens.
 * Days 20–31 open in M−1 (clamped); 1–19 open in cycle month M.
 * A force-closed month is skipped even if its open day is still ahead.
 */
export function nextOpenChicagoDate(
  group: CycleGroup,
  now: Date,
  closedYearMonths: readonly string[],
) {
  const today = chicagoDate(now);
  const closed = new Set(closedYearMonths);
  let cycle = yearMonthString(today);
  for (let i = 0; i < 3; i += 1) {
    if (!closed.has(cycle)) {
      const open = cycleOpenChicagoDate(cycle, group.submit_start_day);
      const close = cycleCloseChicagoDate(cycle, group.submit_end_day);
      if (compareChicagoDate(today, close) <= 0) {
        return open;
      }
    }
    cycle = incrementYearMonth(cycle);
  }
  return cycleOpenChicagoDate(cycle, group.submit_start_day);
}

function nextOpenShort(
  group: CycleGroup,
  now: Date,
  closedYearMonths: readonly string[],
): string {
  const open = nextOpenChicagoDate(group, now, closedYearMonths);
  return shortMonthDay(yearMonthString(open), open.day);
}

/** e.g. "Oct 1, 2026" — the next date writing opens for this group. */
export function nextOpenDateLabel(
  group: CycleGroup,
  closedYearMonths: readonly string[],
  now: Date = new Date(),
): string {
  const open = nextOpenChicagoDate(group, now, closedYearMonths);
  return shortMonthDayYear(yearMonthString(open), open.day);
}

export function shortMonthDay(yearMonth: string, day: number): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return `the ${ordinal(day)}`;
  return `${monthName(parsed.month).slice(0, 3)} ${day}`;
}

export function shortMonthDayYear(yearMonth: string, day: number): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return `the ${ordinal(day)}`;
  return `${monthName(parsed.month).slice(0, 3)} ${day}, ${parsed.year}`;
}

export function windowClosesPhrase(yearMonth: string, endDay: number): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return `the ${ordinal(endDay)}`;
  return chicagoWeekdayTheDay(parsed.year, parsed.month, endDay);
}

/** e.g. "You'll get an email on Sep 9, 2026." */
export function capsuleEmailPhrase(yearMonth: string, emailDay: number): string {
  return `You'll get an email on ${shortMonthDayYear(yearMonth, emailDay)}.`;
}

export function nextOpenPhrase(fromYearMonth: string, startDay: number): string {
  const open = cycleOpenChicagoDate(incrementYearMonth(fromYearMonth), startDay);
  const name = monthName(open.month);
  if (!name) return `the ${ordinal(open.day)}`;
  return `${name} ${open.day}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}
