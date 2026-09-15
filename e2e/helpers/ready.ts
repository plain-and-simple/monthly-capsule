import { expect, type Page } from "@playwright/test";
import {
  GROUP_PRIMARY_EDIT,
  GROUP_PRIMARY_SUBMIT,
  LANDING_SIGN_IN,
  LANDING_SIGN_UP,
  MANAGE_EMPTY_TITLE,
  SUBMIT_DRAFT,
  SUBMIT_SAVED_DRAFT,
} from "../../src/lib/copy";
import { canRunAuthenticatedE2E } from "../../src/lib/e2e-target";
import { STUDIO_CODE_ERROR } from "../../src/lib/studio-code";

export const BAD_STUDIO_CODE = "not-a-real-studio-code";

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
  await expect(page.getByRole("heading", { name: LANDING_SIGN_UP })).toBeVisible();
  await page.getByRole("button", { name: LANDING_SIGN_IN }).click();
  await expect(page.getByRole("heading", { name: LANDING_SIGN_IN })).toBeVisible();
}

export async function signIn(page: Page, email: string, password: string) {
  await openSignIn(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: LANDING_SIGN_IN, exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/" || url.searchParams.has("error"));
  const error = page.locator(".err");
  if (await error.count()) {
    throw new Error(`Sign-in failed: ${await error.first().innerText()}`);
  }
}

export async function openFirstGroupFromManage(page: Page) {
  if (new URL(page.url()).pathname === "/manage") {
    await expect(page.getByRole("heading", { name: MANAGE_EMPTY_TITLE })).toBeVisible();
    const row = page.locator("button.listitem, a.listitem").first();
    await expect(row).toBeVisible();
    await row.click();
  }
  await expect(page).toHaveURL(/\/g\/[0-9a-f-]{36}/i);
  await expect(page.getByRole("link", { name: "Your groups" })).toBeVisible();
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
    await expect(page.getByText("Closed").first()).toBeVisible();
    return "closed" as const;
  }

  await expect(page).toHaveURL(/\/submit$/);
  if (await page.getByText("Closed.").count()) {
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
