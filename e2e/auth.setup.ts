import { test as setup } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { E2E_STORAGE_STATE_PATH, e2eCredentials, signIn } from "./helpers/ready";

setup("authenticate", async ({ page }) => {
  mkdirSync(dirname(E2E_STORAGE_STATE_PATH), { recursive: true });
  const creds = e2eCredentials();
  if (!creds) {
    writeFileSync(E2E_STORAGE_STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  await signIn(page, creds.email, creds.password);
  await page.context().storageState({ path: E2E_STORAGE_STATE_PATH });
});
