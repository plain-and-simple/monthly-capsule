import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLEAR_ACCOUNT_SESSION_PATH,
  OPEN_SOLO_GROUP_PATH,
  cookieWriteAllowed,
  decideAccountSession,
  decideManageSolo,
} from "./session-policy";

const here = dirname(fileURLToPath(import.meta.url));

describe("cookie write context", () => {
  it("forbids writes during Server Component render", () => {
    expect(cookieWriteAllowed("server_component")).toBe(false);
  });

  it("allows writes in a Server Action or Route Handler", () => {
    expect(cookieWriteAllowed("server_action")).toBe(true);
    expect(cookieWriteAllowed("route_handler")).toBe(true);
  });
});

describe("invalid / missing account cookie", () => {
  it("no cookie is anonymous — no write", () => {
    expect(
      decideAccountSession({
        cookiePresent: false,
        payloadValid: false,
        accountFound: false,
      }),
    ).toEqual({ action: "anonymous" });
  });

  it("tampered or expired JWT clears via the Route Handler", () => {
    expect(
      decideAccountSession({
        cookiePresent: true,
        payloadValid: false,
        accountFound: false,
      }),
    ).toEqual({ action: "clear_via_route", path: CLEAR_ACCOUNT_SESSION_PATH });
    expect(CLEAR_ACCOUNT_SESSION_PATH).toBe("/api/session/clear");
  });

  it("valid JWT with no account row clears via the Route Handler", () => {
    expect(
      decideAccountSession({
        cookiePresent: true,
        payloadValid: true,
        accountFound: false,
      }),
    ).toEqual({ action: "clear_via_route", path: CLEAR_ACCOUNT_SESSION_PATH });
  });

  it("valid JWT and account stays signed in — no write", () => {
    expect(
      decideAccountSession({
        cookiePresent: true,
        payloadValid: true,
        accountFound: true,
      }),
    ).toEqual({ action: "signed_in" });
  });
});

describe("single-group manage redirect", () => {
  it("0 or many groups render /manage (no cookie write)", () => {
    expect(decideManageSolo(0)).toEqual({ action: "render" });
    expect(decideManageSolo(2)).toEqual({ action: "render" });
    expect(decideManageSolo(5)).toEqual({ action: "render" });
  });

  it("exactly one group opens via the Route Handler that may set the group cookie", () => {
    expect(decideManageSolo(1)).toEqual({
      action: "open_via_route",
      path: OPEN_SOLO_GROUP_PATH,
    });
    expect(OPEN_SOLO_GROUP_PATH).toBe("/api/session/open-solo");
  });
});

describe("RSC cookie-write regression", () => {
  it("GET /manage does not call cookies().set helpers during render", () => {
    const page = readFileSync(resolve(here, "../app/(app)/manage/page.tsx"), "utf8");
    expect(page).not.toMatch(/\bsetSession\b/);
    expect(page).not.toMatch(/\bclearAccountSession\b/);
    expect(page).not.toMatch(/\bclearSession\b/);
    expect(page).toContain("decideManageSolo");
    expect(page).toContain("open_via_route");
    expect(page).toContain("solo.path");
  });

  it("getAccount does not write cookies; stale sessions redirect to the clearer", () => {
    const source = readFileSync(resolve(here, "./session.ts"), "utf8");
    const start = source.indexOf("export async function getAccount(");
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport async function", start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    expect(body).not.toContain("clearAccountSession");
    expect(body).not.toContain("jar.set");
    expect(body).toContain("decideAccountSession");
    expect(body).toContain("clear_via_route");
  });

  it("Route Handlers perform the cookie writes", () => {
    const clearer = readFileSync(resolve(here, "../app/api/session/clear/route.ts"), "utf8");
    expect(clearer).toContain("clearAccountSession");
    expect(clearer).toContain('export async function GET');

    const opener = readFileSync(resolve(here, "../app/api/session/open-solo/route.ts"), "utf8");
    expect(opener).toContain("setSession");
    expect(opener).toContain('export async function GET');
  });
});
