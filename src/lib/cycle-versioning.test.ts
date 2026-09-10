import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("force-open same-month versioning wiring", () => {
  it("force-open targets this Chicago month and plans a new edition", () => {
    const source = readFileSync(resolve(here, "../actions/cycle.ts"), "utf8");
    expect(source).toContain("forceOpenYearMonth");
    expect(source).toContain("planForceOpen");
    expect(source).not.toContain("incrementYearMonth");
    expect(source).not.toContain("nextClosedToOpenYearMonth");
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
