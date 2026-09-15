import { PRODUCTION_HOST, PRODUCTION_ORIGIN } from "./hosting";

/** Explicit opt-in. Any other value (including "true") stays fail-closed. */
export const E2E_ALLOW_PRODUCTION_VALUE = "1";

export const E2E_LOCAL_ORIGIN = "http://127.0.0.1:3000";

export type E2ETargetEnv = Record<string, string | undefined>;

export function isProductionE2ETarget(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

export function assertE2ETargetAllowed(
  baseUrl: string,
  env: E2ETargetEnv = process.env,
): void {
  if (!isProductionE2ETarget(baseUrl)) return;
  if (env.E2E_ALLOW_PRODUCTION === E2E_ALLOW_PRODUCTION_VALUE) return;
  throw new Error(
    `Refusing to run e2e against production (${PRODUCTION_ORIGIN}). ` +
      `Point E2E_BASE_URL at a preview or localhost, or set E2E_ALLOW_PRODUCTION=${E2E_ALLOW_PRODUCTION_VALUE}.`,
  );
}

/**
 * Resolve the browser origin for Playwright.
 * Never defaults to production. Unset E2E_BASE_URL → local webServer.
 */
export function resolveE2EBaseURL(env: E2ETargetEnv = process.env): string {
  const explicit = env.E2E_BASE_URL?.trim();
  const base = explicit || E2E_LOCAL_ORIGIN;
  assertE2ETargetAllowed(base, env);
  return base.replace(/\/$/, "");
}

export function shouldStartLocalWebServer(env: E2ETargetEnv = process.env): boolean {
  return !env.E2E_BASE_URL?.trim();
}

/**
 * Authenticated Ready paths need a real backend (preview or local .env.local).
 * In CI, a missing E2E_BASE_URL means the dummy `next start` used for smoke —
 * do not hit sign-in / submit against that.
 */
export function canRunAuthenticatedE2E(env: E2ETargetEnv = process.env): boolean {
  if (!env.E2E_EMAIL?.trim() || !env.E2E_PASSWORD?.trim()) return false;
  if (env.CI && !env.E2E_BASE_URL?.trim()) return false;
  return true;
}

export function canRunCronDryRun(env: E2ETargetEnv = process.env): boolean {
  if (!env.E2E_CRON_SECRET?.trim()) return false;
  if (env.CI && !env.E2E_BASE_URL?.trim()) return false;
  return true;
}
