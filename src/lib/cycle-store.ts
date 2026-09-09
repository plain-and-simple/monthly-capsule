import "server-only";
import { closedYearMonths } from "@/lib/compile";
import { openSubmitYearMonth } from "@/lib/cycle";
import type { Group } from "@/lib/types";

export async function resolveSubmitWindow(group: Group, now: Date = new Date()) {
  const closed = await closedYearMonths(group.id);
  const yearMonth = openSubmitYearMonth(group, closed, now);
  return { open: yearMonth !== null, yearMonth, closed };
}
