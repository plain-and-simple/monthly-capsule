import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("force-open same-month versioning wiring", () => {
  it("force-open reads a posted key and accepts only an allowed cycle", () => {
    const source = readFileSync(resolve(here, "../actions/cycle.ts"), "utf8");
    const openFn = source.slice(
      source.indexOf("export async function forceOpenSubmit"),
      source.indexOf("export async function forceCloseCompile"),
    );
    expect(openFn).toContain("allowedForceOpenYearMonths");
    expect(openFn).toContain("acceptForceOpenYearMonth");
    expect(openFn).toContain('formData.get("yearMonth")');
    expect(openFn).toContain("CYCLE_OPEN_NOT_ALLOWED");
    expect(openFn).toContain("planForceOpen");
    expect(openFn).toContain('ensureMonth(groupId, yearMonth, "open", plan.version)');
    expect(openFn).not.toContain("forceOpenYearMonth");
    expect(openFn).not.toContain("nextCycleYearMonth");
    expect(openFn).not.toContain("incrementYearMonth");
    expect(openFn).not.toContain("nextClosedToOpenYearMonth");
    expect(openFn.indexOf("if (!yearMonth)")).toBeLessThan(openFn.indexOf("force_open_year_month"));
    expect(openFn.indexOf("CYCLE_OPEN_NOT_ALLOWED")).toBeLessThan(openFn.indexOf("ensureMonth"));

    const helper = readFileSync(resolve(here, "./group-status.ts"), "utf8");
    const allowedFn = helper.slice(
      helper.indexOf("export function allowedForceOpenYearMonths"),
      helper.indexOf("export function acceptForceOpenYearMonth"),
    );
    expect(allowedFn).toContain("nextCycleYearMonth");
    expect(allowedFn).not.toContain("forceOpenYearMonth");

    const form = readFileSync(resolve(here, "../components/cycle-form.tsx"), "utf8");
    expect(form).toContain("CYCLE_OPEN_EARLY");
    expect(form).toContain("cycleReopenNewVersion");
    expect(form).toContain("capsuleMonthLabel");
    expect(form).toContain('name="yearMonth"');
    expect(form).toContain("nextYearMonth");
    expect(form).toContain("reopenYearMonth");
    expect(form).toContain("CYCLE_CLOSE_NOTE");
    expect(form).toContain("btn btn--secondary");
    expect(form).not.toContain("Open submit early");
    expect(form).not.toContain("You can open again for a new version.");

    const page = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    expect(page).toContain("allowedForceOpenYearMonths");
    expect(page).toContain("nextYearMonth={forceOpen.nextYearMonth}");
    expect(page).toContain("reopenYearMonth={forceOpen.reopenYearMonth}");
    expect(page).toContain("submitWindowCloseDay");
  });

  it("does not copy submissions onto a newly opened edition", () => {
    const source = readFileSync(resolve(here, "../actions/cycle.ts"), "utf8");
    expect(source).toContain('ensureMonth(groupId, yearMonth, "open", plan.version)');
    expect(source).not.toMatch(/from\("submissions"\)[\s\S]{0,200}insert/);
    expect(source).not.toMatch(/copy.*submission/i);
  });

  it("compile snapshots archive for that month_id / edition", () => {
    const source = readFileSync(resolve(here, "./compile.ts"), "utf8");
    expect(source).toContain("snapshotMonthArchive(group, yearMonth, monthId, monthVersion)");
    expect(source).toContain("ensureMonth(group.id, yearMonth, \"closed\", version)");
  });

  it("email link includes the edition path", () => {
    const source = readFileSync(resolve(here, "./email.ts"), "utf8");
    expect(source).toContain("capsuleHref");
    expect(source).toContain("findGroupCapsule");
  });
});
