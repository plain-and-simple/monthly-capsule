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

  it("closed submit shows guidance instead of a one-word dead end", () => {
    const source = readFileSync(resolve(here, "../components/submit-form.tsx"), "utf8");
    expect(source).not.toMatch(/>\s*Closed\.\s*</);
    expect(source).toContain("Writing is closed");
    expect(source).toContain("keepPhotoIds");
    expect(source).toContain("photosTouched");
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

  it("leaveGroup action is not present", () => {
    expect(() =>
      readFileSync(resolve(here, "../actions/leave.ts"), "utf8"),
    ).toThrow();
  });

  it("Save login is elevated near the top for seats without an account", () => {
    const source = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    const elevated = source.indexOf("elevated");
    const monthCard = source.indexOf("card card--pad-lg");
    expect(elevated).toBeGreaterThan(-1);
    expect(elevated).toBeLessThan(monthCard);
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

  it("create checks the studio code before leaving step 1", () => {
    const source = readFileSync(resolve(here, "../components/create-form.tsx"), "utf8");
    expect(source).toContain("checkStudioCode");
    expect(source).toContain("Make a new PIN");
  });

  it("capsule not-ready state guides back to the group", () => {
    const source = readFileSync(resolve(here, "../app/(app)/g/[uuid]/capsule/view.tsx"), "utf8");
    expect(source).toContain("Capsule not ready yet");
    expect(source).toContain("Back to the group");
  });
});
