import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("submit model A UI", () => {
  it("exposes Save as draft and Save and submit", () => {
    const source = readFileSync(resolve(here, "../components/submit-form.tsx"), "utf8");
    expect(source).toContain("SUBMIT_DRAFT");
    expect(source).toContain("SUBMIT_AND_SEND");
    expect(source).toContain('value="draft"');
    expect(source).toContain('value="submit"');
  });
});

describe("privacy and chrome locks", () => {
  it("People does not name who has not written", () => {
    const source = readFileSync(resolve(here, "../app/(app)/g/[uuid]/people/page.tsx"), "utf8");
    expect(source).not.toContain("Not yet");
    expect(source).not.toContain("Written");
  });

  it("group home signs out instead of an ambiguous Leave", () => {
    const source = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    expect(source).not.toMatch(/>\s*Leave\s*</);
    expect(source).not.toContain("leaveGroup");
  });

  it("Your groups goes to /manage and the month badge sits in the card", () => {
    const source = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    expect(source).toContain('href="/manage"');
    expect(source).toContain("Your groups");
    const card = source.indexOf("card card--pad-lg");
    const openBadge = source.indexOf("badge--open");
    const closedBadge = source.indexOf("badge--closed");
    expect(card).toBeGreaterThan(-1);
    expect(openBadge).toBeGreaterThan(card);
    expect(closedBadge).toBeGreaterThan(card);
    expect(source.slice(0, card)).not.toContain("badge--open");
    expect(source.slice(0, card)).not.toContain("badge--closed");
  });

  it("manage list shows owner or member per group", () => {
    const source = readFileSync(resolve(here, "../app/(app)/manage/page.tsx"), "utf8");
    expect(source).toContain("membershipRoleLabel");
    expect(source).toContain("member.role");
  });
});
