import { expect, type Page } from "@playwright/test";
import {
  GROUP_PRIMARY_EDIT,
  GROUP_PRIMARY_SUBMIT,
  LANDING_SIGN_IN,
  MANAGE_EMPTY_TITLE,
  SUBMIT_AND_SEND,
  SUBMIT_CLOSED_HEADING,
  SUBMIT_DRAFT,
  SUBMIT_SAVED_DRAFT,
} from "../../src/lib/copy";
import { CYCLE_OPENED } from "../../src/lib/cycle";
import { canRunAuthenticatedE2E } from "../../src/lib/e2e-target";
import { STUDIO_CODE_ERROR } from "../../src/lib/studio-code";
import { E2E_STORAGE_STATE_PATH } from "./auth-file";

export const BAD_STUDIO_CODE = "not-a-real-studio-code";

export { E2E_STORAGE_STATE_PATH };

export function e2eCredentials(): {
  email: string;
  password: string;
  groupPin: string | null;
  groupId: string | null;
} | null {
  if (!canRunAuthenticatedE2E()) return null;
  const email = process.env.E2E_EMAIL?.trim() ?? "";
  const password = process.env.E2E_PASSWORD?.trim() ?? "";
  return {
    email,
    password,
    groupPin: process.env.E2E_GROUP_PIN?.trim() || null,
    groupId: process.env.E2E_GROUP_ID?.trim() || null,
  };
}

export async function openSignIn(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: LANDING_SIGN_IN })).toBeVisible();
}

export async function signIn(page: Page, email: string, password: string) {
  await openSignIn(page);
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: LANDING_SIGN_IN, exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/" || url.searchParams.has("error"));
  const error = page.locator(".err");
  if (await error.count()) {
    throw new Error(`Sign-in failed: ${await error.first().innerText()}`);
  }
  await expect(page).toHaveURL(/\/manage$/);
}

export async function openCapsuleCover(page: Page): Promise<"letters" | "empty" | "none"> {
  const primary = page.getByRole("link", { name: /Read the capsule/i });
  if ((await primary.count()) === 0) return "none";
  await primary.first().click();
  if ((await page.getByText("No letters this month.").count()) > 0) return "empty";
  return "letters";
}

export async function openFirstGroupFromManage(page: Page) {
  const groupId = e2eCredentials()?.groupId;
  if (groupId) {
    await page.goto(`/g/${groupId}`);
    await expect(page).toHaveURL(new RegExp(`/g/${groupId}`, "i"));
    await expect(page.getByRole("link", { name: "Your groups" })).toBeVisible();
    return;
  }
  if (new URL(page.url()).pathname === "/manage") {
    await expect(page.getByRole("heading", { name: MANAGE_EMPTY_TITLE })).toBeVisible();
    const row = page.locator("button.listitem, a.listitem").first();
    await expect(row).toBeVisible();
    await row.click();
  }
  await expect(page).toHaveURL(/\/g\/[0-9a-f-]{36}/i);
  await expect(page.getByRole("link", { name: "Your groups" })).toBeVisible();
}

/** 1×1 PNG used to prove Add appends without depending on a fixture file. */
export const E2E_TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function addSubmitPhoto(page: Page, name: string) {
  const before = await page.locator(".photo img").count();
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: E2E_TINY_PNG,
  });
  await expect(page.locator(".photo img")).toHaveCount(before + 1, { timeout: 15_000 });
}

export async function openSubmitIfClosed(page: Page) {
  const openEarly = page.getByRole("button", { name: "Open submit early" });
  if ((await openEarly.count()) === 0) return;
  await openEarly.click();
  await expect(page.getByText(CYCLE_OPENED)).toBeVisible({ timeout: 20_000 });
  await page.reload();
}

export async function submitLetterWithTwoPhotos(page: Page) {
  const write = page.getByRole("link", { name: GROUP_PRIMARY_SUBMIT });
  const resume = page.getByRole("link", { name: "Continue your draft" });
  const edit = page.getByRole("link", { name: GROUP_PRIMARY_EDIT });
  if (await write.count()) {
    await write.click();
  } else if (await resume.count()) {
    await resume.click();
  } else if (await edit.count()) {
    await edit.click();
  } else {
    throw new Error("Submit is still closed after Open submit early.");
  }
  await expect(page).toHaveURL(/\/submit$/);
  const letter = page.getByLabel("Letter");
  await expect(letter).toBeVisible();
  const stamp = `e2e letter ${new Date().toISOString()}`;
  await letter.fill(stamp);
  await addSubmitPhoto(page, "one.png");
  await addSubmitPhoto(page, "two.png");
  await page.getByRole("button", { name: SUBMIT_AND_SEND }).click();
  await expect(page.getByText("Submitted").first()).toBeVisible({ timeout: 30_000 });
}

export async function goYourGroupsThenOpenGroup(page: Page) {
  await openFirstGroupFromManage(page);
  await page.getByRole("link", { name: "Your groups" }).click();
  await expect(page).toHaveURL(/\/manage$/);
  await expect(page.getByRole("heading", { name: MANAGE_EMPTY_TITLE })).toBeVisible();
  await openFirstGroupFromManage(page);
}

export async function saveDraftIfWindowOpen(page: Page) {
  const write = page.getByRole("link", { name: GROUP_PRIMARY_SUBMIT });
  const resume = page.getByRole("link", { name: "Continue your draft" });
  const edit = page.getByRole("link", { name: GROUP_PRIMARY_EDIT });
  if (await write.count()) {
    await write.click();
  } else if (await resume.count()) {
    await resume.click();
  } else if (await edit.count()) {
    await edit.click();
  } else {
    await expect(page.getByText(SUBMIT_CLOSED_HEADING).or(page.getByText("Closed")).first()).toBeVisible();
    return "closed" as const;
  }

  await expect(page).toHaveURL(/\/submit$/);
  if (await page.getByRole("heading", { name: SUBMIT_CLOSED_HEADING }).count()) {
    return "closed" as const;
  }

  const letter = page.getByLabel("Letter");
  await expect(letter).toBeVisible();
  const existing = await letter.inputValue();
  const stamp = `e2e draft ${new Date().toISOString()}`;
  await letter.fill(existing ? `${existing}\n\n${stamp}` : stamp);
  await page.getByRole("button", { name: SUBMIT_DRAFT }).click();
  await expect(page.getByText(SUBMIT_SAVED_DRAFT).first()).toBeVisible({ timeout: 20_000 });
  return "drafted" as const;
}

export { STUDIO_CODE_ERROR };
