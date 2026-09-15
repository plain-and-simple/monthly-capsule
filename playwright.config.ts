import { defineConfig, devices } from "@playwright/test";
import {
  E2E_LOCAL_ORIGIN,
  resolveE2EBaseURL,
  shouldStartLocalWebServer,
} from "./src/lib/e2e-target";

const baseURL = resolveE2EBaseURL();
const startLocal = shouldStartLocalWebServer();

/**
 * Dummy env for the local smoke server only. Never set RESEND_API_KEY here —
 * unset key skips send; cron `?dry=1` previews without calling Resend.
 * Do not put CREATE_GROUP_CODE / studio secrets in this file.
 */
const localWebServerEnv = {
  COOKIE_SECRET: process.env.COOKIE_SECRET || "e2e-local-cookie-secret",
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "e2e-anon-key",
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY || "e2e-service-role-key",
  CRON_SECRET: process.env.CRON_SECRET || "e2e-local-cron-secret",
  APP_URL: E2E_LOCAL_ORIGIN,
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: startLocal
    ? {
        command: process.env.CI ? "npm run start" : "npm run dev",
        url: E2E_LOCAL_ORIGIN,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { ...process.env, ...localWebServerEnv },
      }
    : undefined,
});
