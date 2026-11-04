import { expect, test } from "@playwright/test";
import { SUBMIT_DRAFT_SAVED, SUBMIT_RESTORED_UNSAVED, SUBMIT_SAVE_RETRYING } from "../src/lib/copy";

const HARNESS = "/e2e-harness/draft-resilience";
const TYPED = "typed draft";

test.describe("Draft resilience (local harness)", () => {
  test("mocked 401 on first draft save does not navigate and retries @smoke", async ({ page }) => {
    const opened = await page.goto(HARNESS);
    test.skip(opened?.status() === 404, "Harness is local smoke only.");

    let saves = 0;
    await page.route("**/api/e2e-harness/draft-save", async (route) => {
      saves += 1;
      if (saves === 1) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ code: "PGRST303", message: "JWT claims validation failed" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "draft" }),
      });
    });

    const letter = page.getByLabel("Letter");
    await expect(letter).toBeVisible();
    await letter.fill(TYPED);
    await expect(page.getByText(SUBMIT_SAVE_RETRYING)).toBeVisible();
    await expect(letter).toHaveValue(TYPED);
    await expect(page).toHaveURL(/\/e2e-harness\/draft-resilience/);
    await expect(page).not.toHaveURL(/\/manage|\/join\//);
    await expect(page.getByText(SUBMIT_DRAFT_SAVED)).toBeVisible();
    await expect(letter).toHaveValue(TYPED);
    expect(saves).toBeGreaterThanOrEqual(2);
  });

  test("reload mid-typing restores the local copy @smoke", async ({ page }) => {
    const opened = await page.goto(HARNESS);
    test.skip(opened?.status() === 404, "Harness is local smoke only.");

    const letter = page.getByLabel("Letter");
    await expect(letter).toBeVisible();
    await letter.fill(TYPED);
    await expect(letter).toHaveValue(TYPED);
    await page.reload();
    await expect(page.getByLabel("Letter")).toHaveValue(TYPED);
    await expect(page.getByText(SUBMIT_RESTORED_UNSAVED)).toBeVisible();
    await expect(page).toHaveURL(/\/e2e-harness\/draft-resilience/);
  });
});
