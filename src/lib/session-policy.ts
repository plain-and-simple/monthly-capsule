/**
 * Session cookie writes are illegal during Server Component render.
 * Next.js only allows cookies().set in a Server Action or Route Handler.
 * https://nextjs.org/docs/app/api-reference/functions/cookies#options
 */

export const CLEAR_ACCOUNT_SESSION_PATH = "/api/session/clear";
export const OPEN_SOLO_GROUP_PATH = "/api/session/open-solo";

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
export function decideManageSolo(_groupCount: number): ManageSoloDecision {
  return { action: "render" };
}
