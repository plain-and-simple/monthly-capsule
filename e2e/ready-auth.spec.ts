import { expect, test } from "@playwright/test";
import {
  CONTRIBUTORS_PREFIX,
  CYCLE_CLOSE_COMPILE,
  CYCLE_OPEN_EARLY,
  GROUP_NEXT_CAPSULE,
  GROUP_PEOPLE_HEADING,
  JOIN_PIN_LABEL,
  MANAGE_EMPTY_TITLE,
  MANAGE_TAG_NOT_OPEN,
  MANAGE_TAG_READ,
  MANAGE_TAG_SUBMIT,
  MANAGE_TAG_SUBMITTED,
} from "../src/lib/copy";
import {
  e2eCredentials,
  goYourGroupsThenOpenGroup,
  openSubmitIfClosed,
  saveDraftIfWindowOpen,
  signIn,
  submitLetterWithTwoPhotos,
} from "./helpers/ready";

const creds = e2eCredentials();

test.describe("Ready authenticated paths", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !creds,
    "Set E2E_EMAIL and E2E_PASSWORD (and E2E_BASE_URL in CI) to run sign-in / groups / submit.",
  );

  test("sign-in lands on Your groups and opens a group", async ({ page }) => {
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await expect(page.getByRole("heading", { name: MANAGE_EMPTY_TITLE })).toBeVisible();
    await expect(page.getByText("Pick one")).toHaveCount(0);
    await expect(page.getByText(/capsule is ready to read/i)).toHaveCount(0);
    await expect(
      page.getByText(
        new RegExp(
          `${MANAGE_TAG_SUBMIT}|${MANAGE_TAG_SUBMITTED}|${MANAGE_TAG_READ}|${MANAGE_TAG_NOT_OPEN}`,
        ),
      ).first(),
    ).toBeVisible();
    await goYourGroupsThenOpenGroup(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);
    await expect(page.getByText(GROUP_PEOPLE_HEADING)).toBeVisible();
    await expect(page.getByRole("heading", { name: GROUP_NEXT_CAPSULE })).toBeVisible();
  });

  test("people redirects home; settings has no cycle buttons; invite has no PIN type-in", async ({
    page,
  }) => {
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await goYourGroupsThenOpenGroup(page);
    const groupUrl = page.url();
    const groupPath = new URL(groupUrl).pathname;

    await page.goto(`${groupPath}/people`);
    await expect(page).toHaveURL(new RegExp(`${groupPath}/?$`));

    await page.goto(`${groupPath}/settings`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: CYCLE_CLOSE_COMPILE })).toHaveCount(0);
    await expect(page.getByRole("button", { name: CYCLE_OPEN_EARLY })).toHaveCount(0);

    await page.goto(`${groupPath}/invite`);
    await expect(page.getByLabel(JOIN_PIN_LABEL)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible();
  });

  test("capsule cover lists contributors without fluff", async ({ page }) => {
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await goYourGroupsThenOpenGroup(page);
    const read = page.getByRole("link", { name: /Read the capsule/i });
    test.skip((await read.count()) === 0, "No compiled capsule to read yet.");
    await read.first().click();
    await expect(page.getByText(new RegExp(`^${CONTRIBUTORS_PREFIX}`))).toBeVisible();
    await expect(page.getByText("Letters and photographs, kept together.")).toHaveCount(0);
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

  test("CI group write path: open, append photos, close, capsule, theme save", async ({ page }) => {
    test.setTimeout(120_000);
    if (!creds) return;
    await signIn(page, creds.email, creds.password);
    await goYourGroupsThenOpenGroup(page);
    await openSubmitIfClosed(page);
    await submitLetterWithTwoPhotos(page);
    await page.getByRole("link", { name: /^← / }).click();
    await expect(page.getByRole("heading", { name: GROUP_NEXT_CAPSULE })).toBeVisible();

    const close = page.getByRole("button", { name: CYCLE_CLOSE_COMPILE });
    await expect(close).toBeVisible();
    await close.click();
    await page.getByRole("button", { name: CYCLE_CLOSE_COMPILE }).click();
    await expect(page.getByText(/capsule is ready/i).first()).toBeVisible({ timeout: 60_000 });
    const notNow = page.getByRole("button", { name: "Not now" });
    if (await notNow.count()) {
      await notNow.click();
    }
    await page.reload();

    const read = page.getByRole("link", { name: /Read the capsule/i }).first();
    await expect(read).toBeVisible();
    await read.click();
    await expect(page.getByText(new RegExp(`^${CONTRIBUTORS_PREFIX}`))).toBeVisible();
    await expect(page.getByText("Letters and photographs, kept together.")).toHaveCount(0);

    await page.getByRole("link", { name: /^← / }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Capsule theme" })).toBeVisible();
    await expect(page.getByRole("button", { name: CYCLE_CLOSE_COMPILE })).toHaveCount(0);
    await page.getByRole("button", { name: "Save theme" }).click();
    await expect(page.getByText("Saved.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Saving…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Make a new PIN" })).toBeVisible();
  });
});
