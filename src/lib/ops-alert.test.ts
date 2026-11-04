import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpsAlertEmail,
  decideOpsAlert,
  markOpsAlertSent,
  OPS_ALERT_THROTTLE_MS,
  resetOpsAlertThrottle,
  shouldSendOpsAlert,
} from "./ops-alert";

const here = dirname(fileURLToPath(import.meta.url));

describe("ops alerts", () => {
  afterEach(() => {
    resetOpsAlertThrottle();
  });

  it("builds an email with route, code, ids, and time — never letter text", () => {
    const email = buildOpsAlertEmail({
      route: "saveLetterDraft",
      code: "PGRST303",
      groupId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      at: "2026-10-05T12:00:00.000Z",
    });
    expect(email.subject).toBe("Capsule ops alert (PGRST303)");
    expect(email.text).toContain("route: saveLetterDraft");
    expect(email.text).toContain("error_code: PGRST303");
    expect(email.text).toContain("group_id: 11111111-1111-4111-8111-111111111111");
    expect(email.text).toContain("member_id: 22222222-2222-4222-8222-222222222222");
    expect(email.text).toContain("time: 2026-10-05T12:00:00.000Z");
    expect(email.text).not.toMatch(/^body:/m);
    expect(email.text).not.toContain("typed draft");
    expect(JSON.stringify(email)).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("skips when ALERT_EMAIL is unset and throttles one send per 10 minutes per error type", () => {
    expect(decideOpsAlert({ alertTo: "", code: "PGRST303" })).toBe("skipped_unset");
    expect(decideOpsAlert({ alertTo: "   ", code: "PGRST303" })).toBe("skipped_unset");
    expect(OPS_ALERT_THROTTLE_MS).toBe(10 * 60 * 1000);

    const now = Date.parse("2026-10-05T12:00:00.000Z");
    expect(shouldSendOpsAlert("PGRST303", now)).toBe(true);
    markOpsAlertSent("PGRST303", now);
    expect(shouldSendOpsAlert("PGRST303", now + 60_000)).toBe(false);
    expect(shouldSendOpsAlert("save_failed", now + 60_000)).toBe(true);
    expect(shouldSendOpsAlert("PGRST303", now + OPS_ALERT_THROTTLE_MS)).toBe(true);
    expect(decideOpsAlert({ alertTo: "alerts@example.com", code: "PGRST303", now: now + 1_000 })).toBe(
      "throttled",
    );

    const readme = readFileSync(resolve(here, "../../README.md"), "utf8");
    const envExample = readFileSync(resolve(here, "../../.env.example"), "utf8");
    expect(readme).toContain("ALERT_EMAIL");
    expect(readme).toContain("Never includes letter text");
    expect(envExample).toContain("ALERT_EMAIL=");
  });
});
