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
});
