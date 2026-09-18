import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOAST_DISMISS_MS, toastDismissed } from "./toast";

const here = dirname(fileURLToPath(import.meta.url));

describe("success toast", () => {
  it("auto-dismisses in the 4–6s band", () => {
    expect(TOAST_DISMISS_MS).toBe(5_000);
    expect(TOAST_DISMISS_MS).toBeGreaterThanOrEqual(4_000);
    expect(TOAST_DISMISS_MS).toBeLessThanOrEqual(6_000);
    expect(toastDismissed(0, 4_999)).toBe(false);
    expect(toastDismissed(0, 5_000)).toBe(true);
  });

  it("wires submit and email success to the shared toast, not muted inline copy only", () => {
    const root = resolve(here, "../..");
    const submit = readFileSync(resolve(root, "src/components/submit-form.tsx"), "utf8");
    expect(submit).toContain("MutationToast");
    expect(submit).toContain("SUBMIT_SAVED_DRAFT");
    expect(submit).toContain("SUBMIT_SUBMITTED");

    const email = readFileSync(resolve(root, "src/components/email-group-form.tsx"), "utf8");
    expect(email).toContain("MutationToast");
    expect(email).toContain("state?.ok ? state.message");

    const toast = readFileSync(resolve(root, "src/components/app-toast.tsx"), "utf8");
    expect(toast).toContain("TOAST_SUCCESS");
    expect(toast).toContain('role="status"');

    const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
    expect(css).toContain(".toast");
    expect(css).toContain("top: 4.75rem");
    expect(css).not.toMatch(/\.toast\s*\{[^}]*bottom:/);
    expect(css).toContain("var(--accent)");
    expect(css).toContain("var(--card)");

    const landing = readFileSync(resolve(root, "src/app/page.tsx"), "utf8");
    expect(landing).toContain("FlashToast");
    expect(landing).toContain("SIGNED_OUT_TOAST");
  });
});
