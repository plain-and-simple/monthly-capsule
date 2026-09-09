/**
 * Hosting lock (do not reopen):
 * - Origin: https://capsule.plainandsimple.app
 * - Separate Vercel project. Not a path on the marketing site.
 * - No Next.js basePath. No assetPrefix. No /capsule site prefix.
 * - Path + rewrite on plainandsimple.app was considered and rejected.
 * - Session cookie is host-only on whichever host serves the app
 *   (production: capsule.plainandsimple.app). Never Domain=.plainandsimple.app.
 */
export const PRODUCTION_ORIGIN = "https://capsule.plainandsimple.app";
export const PRODUCTION_HOST = "capsule.plainandsimple.app";

export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function sessionCookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

export function isHostOnlyCookie(
  options: ReturnType<typeof sessionCookieOptions>,
): boolean {
  return !("domain" in options) && options.path === "/";
}
