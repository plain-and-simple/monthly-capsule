export const DEFAULT_MONTH_VERSION = 1;
export const MAX_MONTH_VERSIONS = 24;

export type CycleMonthRow = {
  year_month: string;
  version: number;
  status: "open" | "closed" | "compiled";
};

export type ForceOpenPlan =
  | { action: "already_open"; version: number }
  | { action: "reopen"; version: number }
  | { action: "create"; version: number }
  | { action: "capped"; version: number };

export function normalizeMonthVersion(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MONTH_VERSION;
}

export function editionsForMonth(
  rows: readonly CycleMonthRow[],
  yearMonth: string,
): CycleMonthRow[] {
  return rows
    .filter((row) => row.year_month === yearMonth)
    .slice()
    .sort((a, b) => a.version - b.version);
}

export function latestEdition(
  rows: readonly CycleMonthRow[],
  yearMonth: string,
): CycleMonthRow | null {
  const list = editionsForMonth(rows, yearMonth);
  return list[list.length - 1] ?? null;
}

export function openEdition(
  rows: readonly CycleMonthRow[],
  yearMonth?: string,
): CycleMonthRow | null {
  const list = yearMonth ? editionsForMonth(rows, yearMonth) : [...rows];
  return list.find((row) => row.status === "open") ?? null;
}

export function compiledYearMonths(rows: readonly CycleMonthRow[]): string[] {
  return [...new Set(rows.filter((row) => row.status === "compiled").map((row) => row.year_month))];
}

export function closedOrCompiledYearMonths(rows: readonly CycleMonthRow[]): string[] {
  return [
    ...new Set(
      rows
        .filter((row) => row.status === "closed" || row.status === "compiled")
        .map((row) => row.year_month),
    ),
  ];
}

/**
 * Next same-month edition to open. Never walks to the next calendar month.
 * Compiled v1 → create v2 (empty submissions; new month row).
 */
export function planForceOpen(rows: readonly CycleMonthRow[], yearMonth: string): ForceOpenPlan {
  const open = openEdition(rows, yearMonth);
  if (open) return { action: "already_open", version: open.version };

  const latest = latestEdition(rows, yearMonth);
  if (!latest) return { action: "create", version: DEFAULT_MONTH_VERSION };
  if (latest.status === "closed") return { action: "reopen", version: latest.version };
  if (latest.version >= MAX_MONTH_VERSIONS) {
    return { action: "capped", version: latest.version };
  }
  return { action: "create", version: latest.version + 1 };
}

export function capsulePath(yearMonth: string, version: number): string {
  const edition = normalizeMonthVersion(version);
  if (edition <= 1) return yearMonth;
  return `${yearMonth}/v${edition}`;
}

export function capsuleHref(groupId: string, yearMonth: string, version: number): string {
  return `/g/${groupId}/capsule/${capsulePath(yearMonth, version)}`;
}

export function parseCapsuleEditionParam(value: string | undefined | null): number | null {
  if (value == null || value === "") return DEFAULT_MONTH_VERSION;
  const match = /^(?:v)?(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function capsuleVersionSuffix(version: number): string {
  const edition = normalizeMonthVersion(version);
  return edition > 1 ? `v${edition}` : "";
}

export function capsuleTitle(monthLabelText: string, version: number): string {
  const suffix = capsuleVersionSuffix(version);
  return suffix ? `${monthLabelText} · ${suffix}` : monthLabelText;
}
