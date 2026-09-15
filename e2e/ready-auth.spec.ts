import { expect, test } from "@playwright/test";
import { JOIN_PIN_LABEL, MANAGE_EMPTY_TITLE } from "../src/lib/copy";
import {
  e2eCredentials,
  goYourGroupsThenOpenGroup,
  saveDraftIfWindowOpen,
  signIn,
} from "./helpers/ready";

const creds = e2eCredentials();

test.describe("Ready authenticated paths", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !creds,
    "Set E2E_EMAIL and E2E_PASSWORD (and E2E_BASE_URL in CI) to run sign-in / groups / submit.",
  );

  test("sign-in reaches Your groups and opens a group", async ({ page }) => {
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await goYourGroupsThenOpenGroup(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();
  });

  test("submit / draft flow when the window is open", async ({ page }) => {
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await goYourGroupsThenOpenGroup(page);
    const result = await saveDraftIfWindowOpen(page);
    expect(["drafted", "closed"]).toContain(result);
  });

  test("join existing Capsule PIN fields when signed in", async ({ page }) => {
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await page.goto("/join");
    await expect(page.getByLabel(JOIN_PIN_LABEL)).toBeVisible();
    await expect(page.getByLabel("Join link or group ID")).toBeVisible();
  });

  test("join existing Capsule with group id and PIN", async ({ page }) => {
    test.skip(
      !creds?.groupPin || !creds.groupId,
      "Set E2E_GROUP_ID and E2E_GROUP_PIN to actually join a group.",
    );
    if (!creds?.groupPin || !creds.groupId) return;
    await signIn(page, creds.email, creds.password);
    await page.goto("/join");
    await page.getByLabel("Join link or group ID").fill(creds.groupId);
    await page.getByLabel(JOIN_PIN_LABEL).fill(creds.groupPin);
    await page.getByRole("button", { name: /^Join/ }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/g/") || url.searchParams.has("error"));
    if (new URL(page.url()).searchParams.has("error")) {
      await expect(page.locator(".err")).toBeVisible();
      return;
    }
    await expect(page).toHaveURL(/\/g\//);
    await expect(page.getByRole("heading", { name: MANAGE_EMPTY_TITLE })).toHaveCount(0);
  });
});
