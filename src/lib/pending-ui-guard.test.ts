import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIENT_PENDING_GUARD_MS, pendingTimedOut } from "./pending-ui";
import { EMAIL_PENDING_GUARD_MS } from "./email-policy";

const here = dirname(fileURLToPath(import.meta.url));

describe("client pending guard", () => {
  it("treats 12s as the hard timeout for primary buttons", () => {
    expect(CLIENT_PENDING_GUARD_MS).toBe(12_000);
    expect(EMAIL_PENDING_GUARD_MS).toBe(CLIENT_PENDING_GUARD_MS);
    expect(pendingTimedOut(0, 11_999)).toBe(false);
    expect(pendingTimedOut(0, 12_000)).toBe(true);
    expect(pendingTimedOut(100, 200, 50)).toBe(true);
  });

  it("wires the guard into pending buttons, links, and group open", () => {
    const button = readFileSync(resolve(here, "../components/pending-submit-button.tsx"), "utf8");
    expect(button).toContain("CLIENT_PENDING_GUARD_MS");
    expect(button).toContain("stuckMs = CLIENT_PENDING_GUARD_MS");
    expect(button).toContain("setTimedOut(true)");

    const link = readFileSync(resolve(here, "../components/pending-link.tsx"), "utf8");
    expect(link).toContain("CLIENT_PENDING_GUARD_MS");

    const open = readFileSync(resolve(here, "../components/open-group-form.tsx"), "utf8");
    expect(open).toContain("CLIENT_PENDING_GUARD_MS");
  });
});
