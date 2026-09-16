import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planLeave } from "./session-open";
import {
  CLEAR_ACCOUNT_SESSION_PATH,
  FLASH_ERROR_MAX,
  JOIN_GROUP_PATH,
  LOGIN_PATH,
  LOGOUT_PATH,
  OPEN_GROUP_PATH,
  OPEN_SOLO_GROUP_PATH,
  SAVE_LOGIN_PATH,
  SIGNED_OUT_NOTICE,
  SIGNED_OUT_PATH,
  SEE_OTHER,
  SIGNUP_PATH,
  STUDIO_PATH,
  cookieWriteAllowed,
  decideAccountSession,
  decideGroupGate,
  decideManageSolo,
  decideOpenGroupRequest,
  decideOpenGroupUi,
  flashErrorPath,
  parseFlashError,
  parseFlashNotice,
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
  it("0, 1, or many groups render /manage (no cookie write)", () => {
    expect(decideManageSolo(0)).toEqual({ action: "render" });
    expect(decideManageSolo(1)).toEqual({ action: "render" });
    expect(decideManageSolo(2)).toEqual({ action: "render" });
    expect(decideManageSolo(5)).toEqual({ action: "render" });
  });

  it("keeps the solo Route Handler for login, but GET /manage never uses it", () => {
    expect(OPEN_SOLO_GROUP_PATH).toBe("/api/session/open-solo");
  });
});

describe("RSC cookie-write regression", () => {
  it("GET /submit does not call cookies().set helpers during render", () => {
    const page = readFileSync(resolve(here, "../app/(app)/g/[uuid]/submit/page.tsx"), "utf8");
    expect(page).not.toMatch(/\bsetSession\b/);
    expect(page).not.toMatch(/\bsetAccountSession\b/);
    expect(page).not.toMatch(/\bclearAccountSession\b/);
    expect(page).not.toMatch(/\bclearSession\b/);
    expect(page).not.toMatch(/cookies\(\)\.set/);
  });

  it("GET /manage does not call cookies().set helpers during render", () => {
    const page = readFileSync(resolve(here, "../app/(app)/manage/page.tsx"), "utf8");
    expect(page).not.toMatch(/\bsetSession\b/);
    expect(page).not.toMatch(/\bclearAccountSession\b/);
    expect(page).not.toMatch(/\bclearSession\b/);
    expect(page).not.toContain("decideManageSolo");
    expect(page).not.toContain("open_via_route");
    expect(page).not.toContain("solo.path");
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
    expect(clearer).toContain("seeOtherWithCookies");
    expect(clearer).toContain("clearAccount");
    expect(clearer).toContain('export async function GET');
    expect(clearer).not.toContain('from "next/navigation"');

    const opener = readFileSync(resolve(here, "../app/api/session/open-solo/route.ts"), "utf8");
    expect(opener).toContain("seeOtherWithCookies");
    expect(opener).toContain("mintSessionToken");
    expect(opener).toContain('export async function GET');
    expect(opener).not.toMatch(/\bsetSession\b/);
    expect(opener).not.toContain('from "next/navigation"');
  });
});

const groupId = "550e8400-e29b-41d4-a716-446655440000";
const otherGroup = "11111111-1111-4111-8111-111111111111";
const memberId = "member-1";
const otherMember = "member-2";

describe("open group via Route Handler", () => {
  it("same session and member can Link to group home", () => {
    expect(
      decideOpenGroupUi({
        groupId,
        memberId,
        session: { groupId, memberId },
      }),
    ).toEqual({ action: "link", path: `/g/${groupId}` });
  });

  it("no session, other group, or stale member id POSTs the opener", () => {
    const viaRoute = {
      action: "open_via_route" as const,
      path: OPEN_GROUP_PATH,
      method: "POST" as const,
    };
    expect(decideOpenGroupUi({ groupId, memberId, session: null })).toEqual(viaRoute);
    expect(
      decideOpenGroupUi({
        groupId,
        memberId,
        session: { groupId: otherGroup, memberId },
      }),
    ).toEqual(viaRoute);
    expect(
      decideOpenGroupUi({
        groupId,
        memberId,
        session: { groupId, memberId: otherMember },
      }),
    ).toEqual(viaRoute);
    expect(OPEN_GROUP_PATH).toBe("/api/session/open-group");
  });

  it("sets the cookie and 303s to /g/id when membership is valid", () => {
    expect(decideOpenGroupRequest({ groupId, memberId })).toEqual({
      action: "set_cookie_and_see_other",
      groupId,
      memberId,
      path: `/g/${groupId}`,
    });
    expect(SEE_OTHER).toBe(303);
  });

  it("missing group or membership 303s to /manage", () => {
    expect(decideOpenGroupRequest({ groupId: null, memberId })).toEqual({
      action: "redirect_manage",
      path: "/manage",
    });
    expect(decideOpenGroupRequest({ groupId, memberId: null })).toEqual({
      action: "redirect_manage",
      path: "/manage",
    });
  });
});

describe("group gate (join vs manage, no redirect loop)", () => {
  it("no session or a session for another group goes to join", () => {
    expect(
      decideGroupGate({
        requestedGroupId: groupId,
        session: null,
        memberFound: false,
        memberGroupId: null,
        groupFound: true,
      }),
    ).toEqual({ action: "join", path: `/join/${groupId}` });
    expect(
      decideGroupGate({
        requestedGroupId: groupId,
        session: { groupId: otherGroup, memberId },
        memberFound: false,
        memberGroupId: null,
        groupFound: true,
      }),
    ).toEqual({ action: "join", path: `/join/${groupId}` });
  });

  it("session for this group but missing membership goes to /manage, not join", () => {
    const manage = { action: "manage" as const, path: "/manage" };
    expect(
      decideGroupGate({
        requestedGroupId: groupId,
        session: { groupId, memberId },
        memberFound: false,
        memberGroupId: null,
        groupFound: true,
      }),
    ).toEqual(manage);
    expect(
      decideGroupGate({
        requestedGroupId: groupId,
        session: { groupId, memberId },
        memberFound: true,
        memberGroupId: otherGroup,
        groupFound: true,
      }),
    ).toEqual(manage);
    expect(
      decideGroupGate({
        requestedGroupId: groupId,
        session: { groupId, memberId },
        memberFound: true,
        memberGroupId: groupId,
        groupFound: false,
      }),
    ).toEqual(manage);
  });

  it("valid session and membership is allowed", () => {
    expect(
      decideGroupGate({
        requestedGroupId: groupId,
        session: { groupId, memberId },
        memberFound: true,
        memberGroupId: groupId,
        groupFound: true,
      }),
    ).toEqual({ action: "allow" });
  });
});

describe("open-group hang regression", () => {
  it("Manage posts to the Route Handler instead of a Server Action", () => {
    const form = readFileSync(resolve(here, "../components/open-group-form.tsx"), "utf8");
    expect(form).toContain("OPEN_GROUP_PATH");
    expect(form).toContain('method="post"');
    expect(form).not.toContain("openManagedGroup");
    expect(form).not.toContain("@/actions/open-group");
    expect(form).toContain("Opening…");
    expect(form).toContain("onSubmit");
    expect(form).not.toMatch(/disabled=\{clicked\}/);

    const page = readFileSync(resolve(here, "../app/(app)/manage/page.tsx"), "utf8");
    expect(page).toContain("decideOpenGroupUi");
    expect(page).toContain("OpenGroupForm");
    expect(page).not.toContain("@/actions/open-group");
  });

  it("open-group Route Handler sets the cookie on the response and redirects 303", () => {
    const route = readFileSync(resolve(here, "../app/api/session/open-group/route.ts"), "utf8");
    expect(route).toContain("seeOtherWithCookies");
    expect(route).toContain("mintSessionToken");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain('from "next/navigation"');
    expect(route).not.toMatch(/\bsetSession\b/);
    expect(route).not.toMatch(/cookies\(\)/);
  });

  it("requireGroupMember uses the gate so missing membership cannot loop through join", () => {
    const source = readFileSync(resolve(here, "./session.ts"), "utf8");
    const start = source.indexOf("async function loadGroupMember");
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport const requireGroupMember", start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    expect(body).toContain("decideGroupGate");
    expect(body).toContain('decision.action === "manage"');
    expect(source).toContain("export const requireGroupMember = cache(loadGroupMember)");
    expect(source).toContain("export async function requireOwnerUncached");
  });
});

describe("leave destination", () => {
  it("clears the group cookie and returns to manage when an account remains", () => {
    expect(planLeave(true)).toEqual({ path: "/manage", clearSession: true });
    expect(planLeave(false)).toEqual({ path: "/", clearSession: true });
  });
});

describe("flash error on 303", () => {
  it("keeps a short user-facing message and drops empty or oversized values", () => {
    expect(parseFlashError("PIN is 6 digits.")).toBe("PIN is 6 digits.");
    expect(parseFlashError("  ")).toBeNull();
    expect(parseFlashError("x".repeat(FLASH_ERROR_MAX + 1))).toBeNull();
    expect(flashErrorPath("/join", "Unknown group.")).toBe("/join?error=Unknown+group.");
    expect(flashErrorPath("/", "Email or password is wrong.", { next: "/join" })).toBe(
      "/?next=%2Fjoin&error=Email+or+password+is+wrong.",
    );
    expect(parseFlashNotice("signed-out")).toBe(SIGNED_OUT_NOTICE);
    expect(parseFlashNotice("anything-else")).toBeNull();
    expect(SIGNED_OUT_PATH).toBe("/?notice=signed-out");
  });
});

describe("session cookie + redirect uses Route Handler 303", () => {
  it("login, signup, join, save-login, and logout post to Route Handlers", () => {
    expect(LOGIN_PATH).toBe("/api/session/login");
    expect(SIGNUP_PATH).toBe("/api/session/signup");
    expect(JOIN_GROUP_PATH).toBe("/api/session/join");
    expect(SAVE_LOGIN_PATH).toBe("/api/session/save-login");
    expect(LOGOUT_PATH).toBe("/api/session/logout");
    expect(STUDIO_PATH).toBe("/api/session/studio");

    for (const relative of [
      "../app/api/session/login/route.ts",
      "../app/api/session/signup/route.ts",
      "../app/api/session/join/route.ts",
      "../app/api/session/save-login/route.ts",
    ]) {
      const route = readFileSync(resolve(here, relative), "utf8");
      expect(route).toContain("respondSessionOpen");
      expect(route).toContain("export async function POST");
      expect(route).not.toContain('from "next/navigation"');
    }

    const logout = readFileSync(resolve(here, "../app/api/session/logout/route.ts"), "utf8");
    expect(logout).toContain("seeOtherWithCookies");
    expect(logout).toContain("SIGNED_OUT_PATH");
    expect(logout).not.toContain("respondSessionOpen");
  });

  it("session-open planners never write cookies or call redirect()", () => {
    const source = readFileSync(resolve(here, "./session-open.ts"), "utf8");
    expect(source).not.toMatch(/\bsetSession\(/);
    expect(source).not.toMatch(/\bsetAccountSession\(/);
    expect(source).not.toMatch(/\bclearSession\(/);
    expect(source).not.toMatch(/\bclearAccountSession\(/);
    expect(source).not.toContain('from "next/navigation"');
    expect(source).toContain("planManageLogin");
    expect(source).toContain("planJoinGroup");
  });

  it("helper sets cookies on the 303 response, not cookies().set", () => {
    const source = readFileSync(resolve(here, "./session-redirect.ts"), "utf8");
    expect(source).toContain("NextResponse.redirect");
    expect(source).toContain("SEE_OTHER");
    expect(source).toContain("response.cookies.set");
    expect(source).toContain("Cache-Control");
    expect(source).toContain("expires: new Date(0)");
    expect(source).not.toMatch(/cookies\(\)/);
    expect(source).toContain("respondSessionOpen");
  });
});

