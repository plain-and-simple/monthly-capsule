import { expect, test } from "@playwright/test";
import {
  JOIN_AUTH_HINT,
  JOIN_EXISTING_CTA,
  LANDING_HEADLINE,
  LANDING_MONTH_GOES,
  LANDING_SIGN_IN,
  LANDING_SIGN_UP,
  PREFERRED_NAME_LABEL,
  PRODUCT_NAME,
} from "../src/lib/copy";
import { BAD_STUDIO_CODE, STUDIO_CODE_ERROR } from "./helpers/ready";

test.describe("Ready smoke (no secrets)", () => {
  test("landing / create-account UI loads @smoke", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(new RegExp(PRODUCT_NAME));
    await expect(page.getByRole("heading", { name: LANDING_HEADLINE })).toBeVisible();
    await expect(page.getByRole("heading", { name: LANDING_SIGN_IN })).toBeVisible();
    await expect(page.getByRole("heading", { name: LANDING_SIGN_UP })).toBeVisible();
    await expect(page.getByLabel(PREFERRED_NAME_LABEL)).toBeVisible();
    await expect(page.getByLabel("Email").first()).toBeVisible();
    await expect(page.getByLabel("Password").first()).toBeVisible();
    await expect(page.getByRole("button", { name: LANDING_SIGN_UP })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a capsule group" })).toHaveCount(0);
    await expect(page.getByText(LANDING_MONTH_GOES)).toBeVisible();
  });

  test("sign-in UI is reachable from landing @smoke", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: LANDING_SIGN_IN })).toBeVisible();
    await expect(page.getByLabel("Email").first()).toBeVisible();
    await expect(page.getByLabel("Password").first()).toBeVisible();
    await expect(page.getByRole("button", { name: LANDING_SIGN_IN, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  });

  test("join existing Capsule UI loads signed out @smoke", async ({ page }) => {
    await page.goto("/join");
    await expect(page.getByRole("heading", { name: JOIN_EXISTING_CTA })).toBeVisible();
    await expect(page.getByText(JOIN_AUTH_HINT)).toBeVisible();
    await expect(page.getByRole("heading", { name: LANDING_SIGN_UP })).toBeVisible();
  });

  test("create-group studio gate loads without submitting a real code @smoke", async ({ page }) => {
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Studio code" })).toBeVisible();
    await expect(page.getByLabel("Code")).toBeVisible();
  });

  test("/admin studio gate rejects a bad code @smoke", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Studio code" })).toBeVisible();
    await page.getByLabel("Code").fill(BAD_STUDIO_CODE);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(STUDIO_CODE_ERROR)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Studio", exact: true })).toHaveCount(0);
  });
});
