import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  capsuleFromHeader,
  cronShouldSendCapsule,
  DEFAULT_RESEND_FROM,
  extractResendFromEmail,
  formatCapsuleSendResult,
  holdEmailUpdate,
  ownerCanEmailCapsule,
  resendSendAccepted,
  sentEmailUpdate,
  shouldMarkCapsuleEmailed,
} from "./email-policy";

describe("cron email_day vs owner hold", () => {
  it("F8 unused force: cron sends when capsule exists and is unsent", () => {
    expect(cronShouldSendCapsule({ email_sent_at: null, email_held: false })).toBe(true);
  });

  it("F6 Not now: cron must not send until owner Sends later", () => {
    expect(cronShouldSendCapsule({ email_sent_at: null, email_held: true })).toBe(false);
    expect(ownerCanEmailCapsule({ email_sent_at: null })).toBe(true);
    expect(holdEmailUpdate()).toEqual({ email_held: true });
  });

  it("F5 after Send: marked sent, no double-send, cron skips", () => {
    const sent = sentEmailUpdate("2026-09-09T15:00:00.000Z");
    expect(sent).toEqual({
      email_sent_at: "2026-09-09T15:00:00.000Z",
      email_held: false,
    });
    expect(cronShouldSendCapsule({ email_sent_at: sent.email_sent_at, email_held: false })).toBe(
      false,
    );
    expect(ownerCanEmailCapsule({ email_sent_at: sent.email_sent_at })).toBe(false);
  });
});

describe("Resend accept vs stamp", () => {
  it("does not treat a Resend error object as success", () => {
    expect(
      resendSendAccepted({
        data: null,
        error: { message: "The capsule@plainandsimple.app domain is not verified.", name: "validation_error" },
      }),
    ).toEqual({
      ok: false,
      message: "The capsule@plainandsimple.app domain is not verified.",
    });
    expect(shouldMarkCapsuleEmailed({ attempted: 1, accepted: 0 })).toBe(false);
  });

  it("does not stamp when Resend returns no id", () => {
    expect(resendSendAccepted({ data: {}, error: null })).toEqual({
      ok: false,
      message: "Resend did not accept the send",
    });
    expect(shouldMarkCapsuleEmailed({ attempted: 0, accepted: 0 })).toBe(false);
  });

  it("stamps only when every attempted send was accepted", () => {
    expect(resendSendAccepted({ data: { id: "re_123" }, error: null })).toEqual({
      ok: true,
      id: "re_123",
    });
    expect(shouldMarkCapsuleEmailed({ attempted: 1, accepted: 1 })).toBe(true);
    expect(shouldMarkCapsuleEmailed({ attempted: 2, accepted: 1 })).toBe(false);
  });

  it("shows sent / skipped / Resend error to the owner", () => {
    expect(formatCapsuleSendResult({ sent: 1, skippedNoEmail: 0, error: null })).toBe("Sent 1.");
    expect(formatCapsuleSendResult({ sent: 1, skippedNoEmail: 2, error: null })).toBe(
      "Sent 1. Skipped 2 with no email.",
    );
    expect(
      formatCapsuleSendResult({
        sent: 0,
        skippedNoEmail: 0,
        error: "The domain is not verified.",
      }),
    ).toBe("Sent 0. Resend error: The domain is not verified.");
  });

  it("uses the designer capsules@ mailbox and a group display From", () => {
    expect(extractResendFromEmail(DEFAULT_RESEND_FROM)).toBe("capsules@plainandsimple.app");
    expect(extractResendFromEmail("Capsule <capsule@plainandsimple.app>")).toBe(
      "capsule@plainandsimple.app",
    );
    expect(capsuleFromHeader("stepppy", DEFAULT_RESEND_FROM)).toEqual({
      ok: true,
      email: "capsules@plainandsimple.app",
      from: "stepppy via Plain and Simple <capsules@plainandsimple.app>",
    });
    expect(capsuleFromHeader("stepppy", "not-an-address")).toEqual({
      ok: false,
      error: "From address is not a valid email.",
    });
  });
});

const here = dirname(fileURLToPath(import.meta.url));

describe("send path must not stamp blindly", () => {
  it("checks Resend accept and recipient resolution before sentEmailUpdate", () => {
    const source = readFileSync(resolve(here, "./email.ts"), "utf8");
    expect(source).toContain("resolveCapsuleRecipients");
    expect(source).toContain("resendSendAccepted");
    expect(source).toContain("shouldMarkCapsuleEmailed");
    expect(source.indexOf("shouldMarkCapsuleEmailed")).toBeLessThan(source.lastIndexOf("sentEmailUpdate"));
  });
});
