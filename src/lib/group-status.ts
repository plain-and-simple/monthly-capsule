import { openSubmitYearMonth, type CycleGroup } from "@/lib/cycle";
import { chicagoWeekdayTheDay, monthName, ordinal } from "@/lib/dates";
import {
  chicagoDate,
  compileTargetYearMonth,
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

function nextOpenShort(
  group: CycleGroup,
  now: Date,
  closedYearMonths: readonly string[],
): string {
  const date = chicagoDate(now);
  const current = yearMonthString(date);
  const closed = new Set(closedYearMonths);
  if (date.day < group.submit_start_day && !closed.has(current)) {
    return shortMonthDay(current, group.submit_start_day);
  }
  return shortMonthDay(incrementYearMonth(current), group.submit_start_day);
}

export function shortMonthDay(yearMonth: string, day: number): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return `the ${ordinal(day)}`;
  return `${monthName(parsed.month).slice(0, 3)} ${day}`;
}

export function windowClosesPhrase(yearMonth: string, endDay: number): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return `the ${ordinal(endDay)}`;
  return chicagoWeekdayTheDay(parsed.year, parsed.month, endDay);
}

export function nextOpenPhrase(fromYearMonth: string, startDay: number): string {
  const next = incrementYearMonth(fromYearMonth);
  const parsed = parseYearMonth(next);
  if (!parsed) return `the ${ordinal(startDay)}`;
  return `${monthName(parsed.month)} ${startDay}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}
