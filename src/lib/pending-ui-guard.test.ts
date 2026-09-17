import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLIENT_PENDING_GUARD_MS,
  pendingGuardRemainingMs,
  pendingTimedOut,
  submitBusyDisablesControl,
} from "./pending-ui";
import { EMAIL_ACTION_TIMEOUT_MS, EMAIL_PENDING_GUARD_MS } from "./email-policy";

const here = dirname(fileURLToPath(import.meta.url));

describe("client pending guard", () => {
  it("keeps a hung-navigation fallback longer than the email action budget", () => {
    expect(CLIENT_PENDING_GUARD_MS).toBe(12_000);
    expect(EMAIL_PENDING_GUARD_MS).toBe(CLIENT_PENDING_GUARD_MS);
    expect(EMAIL_ACTION_TIMEOUT_MS).toBe(9_000);
    expect(EMAIL_ACTION_TIMEOUT_MS).toBeLessThan(CLIENT_PENDING_GUARD_MS);
    expect(pendingTimedOut(0, 11_999)).toBe(false);
    expect(pendingTimedOut(0, 12_000)).toBe(true);
    expect(pendingGuardRemainingMs(0, 3_000)).toBe(9_000);
  });

  it("disables the control only after the request is in flight", () => {
    expect(submitBusyDisablesControl(false)).toBe(false);
    expect(submitBusyDisablesControl(true)).toBe(true);
  });

  it("clears clicked busy when the action is no longer in flight", () => {
    const source = readFileSync(resolve(here, "../components/pending-submit-button.tsx"), "utf8");
    expect(source).toContain("submitBusyDisablesControl(inFlight && !ignorePending)");
    expect(source).toContain("if (!inFlight) setClicked(false)");
    expect(source).not.toMatch(/disabled=\{busy\}/);
  });
});
