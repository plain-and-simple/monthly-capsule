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

  it("a compiled reopen inserts the next edition and does not rewrite prior rows", () => {
    const compile = readFileSync(resolve(here, "./compile.ts"), "utf8");
    const createFn = compile.slice(
      compile.indexOf("async function createMonth"),
      compile.indexOf("export async function ensureMonth"),
    );
    expect(createFn).toContain(".insert({ group_id: groupId, year_month: yearMonth, version, status })");
    expect(createFn).not.toContain(".update(");
    expect(createFn).not.toContain(".delete(");
    expect(createFn).not.toContain("upsert");
    expect(createFn).not.toContain('.from("submissions")');
    expect(createFn).not.toContain('.from("capsules")');
    expect(createFn).not.toContain("pdf_storage_path");
    expect(createFn).not.toContain(".storage");

    const ensureFn = compile.slice(
      compile.indexOf("export async function ensureMonth"),
      compile.indexOf("async function clearForceOpenIfMatch"),
    );
    expect(ensureFn).toContain("if (!existing) return createMonth(groupId, yearMonth, edition, status)");
    const compiledGuard = ensureFn.slice(
      ensureFn.indexOf('existing.status === "compiled"'),
      ensureFn.indexOf("return existing"),
    );
    expect(compiledGuard).toContain('throw new Error("Cannot reopen a compiled edition")');
    expect(compiledGuard).not.toContain(".update(");
    expect(compiledGuard).not.toContain(".delete(");
    expect(compiledGuard).not.toContain(".insert(");
    expect(ensureFn).not.toContain(".delete(");
    expect(ensureFn).not.toContain('.from("submissions")');
    expect(ensureFn).not.toContain('.from("capsules")');
    expect(ensureFn).not.toContain("pdf_storage_path");
    expect(ensureFn).not.toContain(".storage");
    expect(ensureFn.match(/\.update\(/g)).toHaveLength(2);
    expect(ensureFn).not.toMatch(/\.update\(\{[^}]*\bversion\b/);
    expect(ensureFn).not.toMatch(/\.update\(\{[^}]*year_month/);

    const cycle = readFileSync(resolve(here, "../actions/cycle.ts"), "utf8");
    const openFn = cycle.slice(
      cycle.indexOf("export async function forceOpenSubmit"),
      cycle.indexOf("export async function forceCloseCompile"),
    );
    expect(openFn).toContain('ensureMonth(groupId, yearMonth, "open", plan.version)');
    expect(openFn).toContain('.from("groups")');
    expect(openFn).toContain(".update({ force_open_year_month: yearMonth })");
    expect(openFn.match(/\.update\(/g)).toHaveLength(1);
    expect(openFn).not.toContain(".delete(");
    expect(openFn).not.toContain('.from("months")');
    expect(openFn).not.toContain('.from("submissions")');
    expect(openFn).not.toContain('.from("capsules")');
    expect(openFn).not.toContain("pdf_storage_path");
    expect(openFn).not.toContain(".storage");
    expect(openFn).not.toContain('plan.action === "reopen"');
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
