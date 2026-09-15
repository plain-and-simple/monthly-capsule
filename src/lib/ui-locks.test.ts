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
    expect(source).toContain("compressPhotoFile");
    expect(source).not.toContain("0.85");
  });

  it("posts groupId without relying on the JS wrapper", () => {
    const source = readFileSync(resolve(here, "../components/submit-form.tsx"), "utf8");
    expect(source).toContain('name="groupId"');
    expect(source).toContain("return action(formData)");
    expect(source).toContain("new File");
  });
});

describe("brand chrome locks", () => {
  it("header mark is the PS lockup, not the full wordmark", () => {
    const brand = readFileSync(resolve(here, "../components/brand.tsx"), "utf8");
    expect(brand).toContain("PsMark");
    expect(brand).not.toContain("CHROME_MARK");
    expect(brand).not.toContain("CapsuleSeal");
    expect(brand).not.toContain("Plain and Simple");
    expect(brand).not.toContain("Monthly Capsule");

    const mark = readFileSync(resolve(here, "../components/ps-mark.tsx"), "utf8");
    expect(mark).toContain("#e08b4a");
    expect(mark).toContain("viewBox=\"0 0 322 173\"");
  });

  it("page title stays the full product name", () => {
    const layout = readFileSync(resolve(here, "../app/layout.tsx"), "utf8");
    expect(layout).toContain('default: "Plain and Simple Monthly Capsule"');
    expect(layout).toContain('template: "%s · Plain and Simple Monthly Capsule"');
  });

  it("favicon and apple-touch are icon-only assets", () => {
    const icon = readFileSync(resolve(here, "../app/icon.svg"), "utf8");
    expect(icon).toContain("#f5f2ea");
    expect(icon).toContain("#1a1712");
    expect(icon).toContain("#e08b4a");
    expect(icon).toContain("<circle");
    expect(icon).not.toContain("envelope");
    expect(icon).not.toContain("M1 4");
    expect(icon).not.toMatch(/M\s*\d+\s+\d+\s+L\s*16\s+\d+\s+L\s*\d+\s+\d+/i);

    const apple = readFileSync(resolve(here, "../app/apple-icon.png"));
    expect(apple.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      true,
    );
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
    expect(source).toContain("JOIN_EXISTING_CTA");
    expect(source).toContain('href="/join"');
    expect(source).toContain("decideOpenGroupUi");
    expect(source).not.toContain("@/actions/open-group");
  });
});

describe("account-before-join IA", () => {
  it("does not let join skip signup or create a PIN-only seat", () => {
    const joinForm = readFileSync(resolve(here, "../components/join-form.tsx"), "utf8");
    expect(joinForm).not.toContain("save_login");
    expect(joinForm).not.toContain("Skip to join");
    expect(joinForm).toContain("signedInAs");

    const joinPlan = readFileSync(resolve(here, "./session-open.ts"), "utf8");
    expect(joinPlan).toContain("JOIN_ACCOUNT_REQUIRED");
    expect(joinPlan).not.toContain("account_id: null");
    expect(joinPlan).not.toContain("email: null");

    const invite = readFileSync(resolve(here, "../app/(app)/join/[uuid]/page.tsx"), "utf8");
    expect(invite).toContain("JoinGate");
    expect(invite).toContain("inviteJoinPath");

    const home = readFileSync(resolve(here, "../app/page.tsx"), "utf8");
    expect(home).toContain("AuthPanel");
    expect(home).toContain("parseReturnPath");
  });

  it("blocks submit without a saved account and lists skipped recipients", () => {
    const submit = readFileSync(resolve(here, "../actions/submit.ts"), "utf8");
    expect(submit).toContain("submitBlockedReason");
    const submitPage = readFileSync(resolve(here, "../app/(app)/g/[uuid]/submit/page.tsx"), "utf8");
    expect(submitPage).toContain("SaveLoginForm");
    expect(submitPage).toContain("membershipHasAccount");
    const email = readFileSync(resolve(here, "./email.ts"), "utf8");
    expect(email).toContain("skippedNames");
    expect(email).toContain("formatSkippedNoEmail");
  });

  it("Manage login exposes Forgot password without redesigning the form", () => {
    const source = readFileSync(resolve(here, "../components/manage-form.tsx"), "utf8");
    expect(source).toContain("FORGOT_PASSWORD_LINK");
    expect(source).toContain('href="/forgot"');
  });
});
