import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("pending mutation UI", () => {
  it("shows busy immediately on submit, including photo packing", () => {
    const file = source("src/components/submit-form.tsx");
    expect(file).toContain("PendingSubmitButton");
    expect(file).toContain("markBusy");
    expect(file.indexOf("markBusy()")).toBeLessThan(file.indexOf("new File"));
    expect(file).toContain('pendingLabel={photos.length > 0 ? "Uploading…" : "Submitting…"}');
    expect(file).toContain('pendingLabel="Saving…"');
  });

  it("shows busy on create, join, manage login, and leave/sign-out", () => {
    expect(source("src/components/create-form.tsx")).toContain("PendingSubmitButton");
    expect(source("src/components/join-form.tsx")).toContain('pendingLabel="Joining…"');
    expect(source("src/components/manage-form.tsx")).toContain('pendingLabel="Signing in…"');
    expect(source("src/components/forgot-password-form.tsx")).toContain('pendingLabel="Sending…"');
    expect(source("src/components/reset-password-form.tsx")).toContain('pendingLabel="Saving…"');
    expect(source("src/components/sign-up-form.tsx")).toContain('pendingLabel="Creating…"');
    expect(source("src/components/sign-out-button.tsx")).toContain('pendingLabel="Signing out…"');
    expect(source("src/components/app-header.tsx")).toContain("SignOutButton");
  });

  it("shows busy on force-cycle, regen, and group open", () => {
    const cycle = source("src/components/cycle-form.tsx");
    expect(cycle).toContain('pendingLabel="Working…"');
    expect(cycle).toContain("OwnerEmailSubmit");
    expect(cycle).toContain('pendingLabel="Opening…"');
    const email = source("src/components/email-group-form.tsx");
    expect(email).toContain('pendingLabel="Sending…"');
    expect(email).toContain("confirmResend");
    expect(email).toContain("ignorePending");
    expect(email).toContain("EMAIL_PENDING_GUARD_MS");
    expect(source("src/components/pending-submit-button.tsx")).toContain("ignorePending");
    expect(source("src/app/(app)/g/[uuid]/capsule/view.tsx")).toContain("alreadySent");
    expect(source("src/components/regen-pin-form.tsx")).toContain('pendingLabel="Making…"');
    expect(source("src/components/open-group-form.tsx")).toContain("Opening…");
    expect(source("src/app/(app)/manage/page.tsx")).toContain("OpenGroupForm");
  });

  it("adds loading fallbacks for slow navigations and batches capsule photo URLs", () => {
    expect(source("src/app/(app)/g/[uuid]/capsule/[yearMonth]/loading.tsx")).toContain(
      "Opening capsule…",
    );
    expect(source("src/app/(app)/g/[uuid]/submit/loading.tsx")).toContain("LoadingBlock");
    expect(source("src/app/(app)/g/[uuid]/page.tsx")).toContain("PendingLink");
    expect(source("src/app/(app)/g/[uuid]/page.tsx")).toContain("prefetch={false}");
    expect(source("src/app/(app)/g/[uuid]/capsule/view.tsx")).toContain("signedPhotoUrls");
    expect(source("src/app/(app)/g/[uuid]/capsule/view.tsx")).not.toContain("await signedPhotoUrl(");
  });
});
