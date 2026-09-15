import { expect, test } from "@playwright/test";
import { canRunCronDryRun } from "../src/lib/e2e-target";

test.describe("Email send path (no Resend charge)", () => {
  test("cron email rejects missing auth @smoke", async ({ request }) => {
    const res = await request.get("/api/cron/email?dry=1");
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  test("cron compile rejects missing auth @smoke", async ({ request }) => {
    const res = await request.get("/api/cron/compile");
    expect(res.status()).toBe(401);
  });

  test("cron email dry-run previews without sending", async ({ request }) => {
    test.skip(
      !canRunCronDryRun(),
      "Set E2E_CRON_SECRET (and E2E_BASE_URL in CI). Uses ?dry=1 so Resend is not called.",
    );
    const res = await request.get("/api/cron/email?dry=1", {
      headers: { Authorization: `Bearer ${process.env.E2E_CRON_SECRET}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });
});
