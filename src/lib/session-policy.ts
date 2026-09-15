/**
 * Session cookie writes are illegal during Server Component render.
 * Next.js only allows cookies().set in a Server Action or Route Handler.
 * https://nextjs.org/docs/app/api-reference/functions/cookies#options
 */

export const CLEAR_ACCOUNT_SESSION_PATH = "/api/session/clear";
export const OPEN_SOLO_GROUP_PATH = "/api/session/open-solo";
export const OPEN_GROUP_PATH = "/api/session/open-group";
export const LOGIN_PATH = "/api/session/login";
export const SIGNUP_PATH = "/api/session/signup";
export const JOIN_GROUP_PATH = "/api/session/join";
export const SAVE_LOGIN_PATH = "/api/session/save-login";
export const LOGOUT_PATH = "/api/session/logout";
export const LEAVE_GROUP_PATH = "/api/session/leave";
export const SEE_OTHER = 303;
export const FLASH_ERROR_MAX = 200;

/** User-facing form error carried on a 303. Reject empty or oversized values. */
export function parseFlashError(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > FLASH_ERROR_MAX) return null;
  return trimmed;
}

export function flashErrorPath(
  path: string,
  error: string,
  extra: Record<string, string | null | undefined> = {},
): string {
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query ?? "");
  for (const [key, val] of Object.entries(extra)) {
    if (val) params.set(key, val);
  }
  params.set("error", error);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : `${base}`;
}

export type CookieWriteContext = "server_component" | "server_action" | "route_handler";

export function cookieWriteAllowed(context: CookieWriteContext): boolean {
  return context === "server_action" || context === "route_handler";
}

export type AccountSessionDecision =
  | { action: "anonymous" }
  | { action: "signed_in" }
  | { action: "clear_via_route"; path: typeof CLEAR_ACCOUNT_SESSION_PATH };

export function decideAccountSession(input: {
  cookiePresent: boolean;
  payloadValid: boolean;
  accountFound: boolean;
}): AccountSessionDecision {
  if (!input.cookiePresent) {
    return { action: "anonymous" };
  }
  if (!input.payloadValid || !input.accountFound) {
    return { action: "clear_via_route", path: CLEAR_ACCOUNT_SESSION_PATH };
  }
  return { action: "signed_in" };
}

export type ManageSoloDecision =
  | { action: "render" }
  | { action: "open_via_route"; path: typeof OPEN_SOLO_GROUP_PATH };

/** GET /manage always lists groups so Your groups and Create stay reachable. */
export function decideManageSolo(groupCount: number): ManageSoloDecision {
  void groupCount;
  return { action: "render" };
}

export type OpenGroupUiDecision =
  | { action: "link"; path: string }
  | { action: "open_via_route"; path: typeof OPEN_GROUP_PATH; method: "POST" };

/** Same-group session can Link to /g/id. Otherwise POST the Route Handler (cookie + 303). */
export function decideOpenGroupUi(input: {
  groupId: string;
  memberId: string;
  session: { groupId: string; memberId: string } | null;
}): OpenGroupUiDecision {
  if (input.session?.groupId === input.groupId && input.session.memberId === input.memberId) {
    return { action: "link", path: `/g/${input.groupId}` };
  }
  return { action: "open_via_route", path: OPEN_GROUP_PATH, method: "POST" };
}

export type OpenGroupRequestDecision =
  | { action: "redirect_manage"; path: "/manage" }
  | { action: "set_cookie_and_see_other"; groupId: string; memberId: string; path: string };

export function decideOpenGroupRequest(input: {
  groupId: string | null;
  memberId: string | null;
}): OpenGroupRequestDecision {
  if (!input.groupId || !input.memberId) {
    return { action: "redirect_manage", path: "/manage" };
  }
  return {
    action: "set_cookie_and_see_other",
    groupId: input.groupId,
    memberId: input.memberId,
    path: `/g/${input.groupId}`,
  };
}

export type GroupGateDecision =
  | { action: "allow" }
  | { action: "join"; path: string }
  | { action: "manage"; path: "/manage" };

/**
 * Mismatched or missing group session goes to join.
 * Cookie for this group but no membership must go to /manage (not join),
 * or join ↔ group home can redirect-loop.
 */
export function decideGroupGate(input: {
  requestedGroupId: string;
  session: { groupId: string; memberId: string } | null;
  memberFound: boolean;
  memberGroupId: string | null;
  groupFound: boolean;
}): GroupGateDecision {
  if (!input.session || input.session.groupId !== input.requestedGroupId) {
    return { action: "join", path: `/join/${input.requestedGroupId}` };
  }
  if (!input.memberFound || !input.groupFound || input.memberGroupId !== input.requestedGroupId) {
    return { action: "manage", path: "/manage" };
  }
  return { action: "allow" };
}
