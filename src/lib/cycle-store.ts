import "server-only";
import { closedYearMonths, listGroupMonthRows, toCycleMonthRows } from "@/lib/compile";
import { openSubmitYearMonth } from "@/lib/cycle";
import { DEFAULT_MONTH_VERSION, openEdition, planForceOpen } from "@/lib/month-version";
import type { Group } from "@/lib/types";

export async function resolveSubmitWindow(group: Group, now: Date = new Date()) {
  const months = await listGroupMonthRows(group.id);
  const rows = toCycleMonthRows(months);
  const closed = await closedYearMonths(group.id);
  const yearMonth = openSubmitYearMonth(group, closed, now);
  if (!yearMonth) {
    return { open: false, yearMonth: null, version: null as number | null, closed, rows };
  }
  const open = openEdition(rows, yearMonth);
  const version = open?.version ?? planForceOpen(rows, yearMonth).version ?? DEFAULT_MONTH_VERSION;
  return { open: true, yearMonth, version, closed, rows };
}
