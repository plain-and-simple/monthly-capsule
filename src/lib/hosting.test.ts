import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_HOST,
  PRODUCTION_ORIGIN,
  isHostOnlyCookie,
  sessionCookieOptions,
} from "./hosting";

const here = dirname(fileURLToPath(import.meta.url));

describe("hosting lock", () => {
  it("is the capsule subdomain with no path prefix", () => {
    const url = new URL(PRODUCTION_ORIGIN);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(PRODUCTION_HOST);
    expect(url.pathname).toBe("/");
  });

  it("raises the Server Action body limit so 6 photos can post (Next.js E394)", () => {
    const source = readFileSync(resolve(here, "../../next.config.ts"), "utf8");
    expect(source).toContain('bodySizeLimit: "16mb"');
    expect(source).toContain("E394");
  });

  it("keeps the session cookie host-only (no parent Domain)", () => {
    const options = sessionCookieOptions(true);
    expect(isHostOnlyCookie(options)).toBe(true);
    expect(options).not.toHaveProperty("domain");
    expect(options.path).toBe("/");
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.httpOnly).toBe(true);
  });
});
