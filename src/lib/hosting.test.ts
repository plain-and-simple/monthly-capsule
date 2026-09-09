import { describe, expect, it } from "vitest";
import {
  PRODUCTION_HOST,
  PRODUCTION_ORIGIN,
  isHostOnlyCookie,
  sessionCookieOptions,
} from "./hosting";

describe("hosting lock", () => {
  it("is the capsule subdomain with no path prefix", () => {
    const url = new URL(PRODUCTION_ORIGIN);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(PRODUCTION_HOST);
    expect(url.pathname).toBe("/");
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
