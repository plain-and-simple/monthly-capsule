import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  capsuleFromHeader,
  cronEmailDueCapsules,
  cronShouldSendCapsule,
  DEFAULT_RESEND_FROM,
  extractResendFromEmail,
  formatCapsuleSendResult,
  holdEmailUpdate,
  ownerCanEmailCapsule,
  ownerEmailFailed,
  previewCapsuleSend,
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

  it("uses the locked Capsule display name and designer mailbox", () => {
    expect(extractResendFromEmail(DEFAULT_RESEND_FROM)).toBe("capsules@plainandsimple.app");
    expect(extractResendFromEmail("Capsule <capsule@plainandsimple.app>")).toBe(
      "capsule@plainandsimple.app",
    );
    expect(capsuleFromHeader(DEFAULT_RESEND_FROM)).toEqual({
      ok: true,
      email: "capsules@plainandsimple.app",
      from: "Capsule <capsules@plainandsimple.app>",
    });
    expect(capsuleFromHeader("Plain and Simple <capsules@plainandsimple.app>")).toEqual({
      ok: true,
      email: "capsules@plainandsimple.app",
      from: "Capsule <capsules@plainandsimple.app>",
    });
    expect(capsuleFromHeader("not-an-address")).toEqual({
      ok: false,
      error: "From address is not a valid email.",
    });
  });
});

describe("cron catch-up for split compile/email and versions", () => {
  const unsent = { email_sent_at: null, email_held: false };

  it("emails every due unsent edition, not only the latest of the calendar month", () => {
    expect(
      cronEmailDueCapsules("2026-09", [
        { yearMonth: "2026-09", version: 1, ...unsent },
        { yearMonth: "2026-09", version: 2, ...unsent },
        { yearMonth: "2026-08", version: 1, ...unsent },
        { yearMonth: "2026-10", version: 1, ...unsent },
        { yearMonth: "2026-09", version: 3, email_sent_at: "2026-09-14T17:53:31.409Z", email_held: false },
        { yearMonth: "2026-09", version: 4, email_sent_at: null, email_held: true },
      ]).map((row) => `${row.yearMonth}v${row.version}`),
    ).toEqual(["2026-08v1", "2026-09v1", "2026-09v2"]);
  });

  it("does not treat a force-compiled future month as due before its email_day", () => {
    expect(
      cronEmailDueCapsules("2026-09", [{ yearMonth: "2026-10", version: 1, ...unsent }]),
    ).toEqual([]);
  });
});

describe("send preview / owner failure", () => {
  it("blocks send when Resend is missing, From is bad, or nobody has an email", () => {
    expect(
      previewCapsuleSend({
        fromOk: true,
        hasResendKey: false,
        recipientCount: 1,
        skippedNoEmail: 0,
      }),
    ).toMatchObject({ canSend: false, reason: "no-resend-key" });
    expect(
      previewCapsuleSend({
        fromOk: false,
        fromError: "From address is not a valid email.",
        hasResendKey: true,
        recipientCount: 1,
        skippedNoEmail: 0,
      }),
    ).toMatchObject({ canSend: false, reason: "bad-from" });
    expect(
      previewCapsuleSend({
        fromOk: true,
        hasResendKey: true,
        recipientCount: 0,
        skippedNoEmail: 2,
      }),
    ).toMatchObject({ canSend: false, reason: "no-recipients", wouldSend: 0 });
    expect(
      previewCapsuleSend({
        fromOk: true,
        hasResendKey: true,
        recipientCount: 1,
        skippedNoEmail: 1,
      }),
    ).toEqual({
      canSend: true,
      reason: "ok",
      wouldSend: 1,
      skippedNoEmail: 1,
      error: null,
    });
  });

  it("treats unstamped owner Send as a visible failure", () => {
    expect(ownerEmailFailed({ markedSent: false })).toBe(true);
    expect(ownerEmailFailed({ markedSent: true })).toBe(false);
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
    expect(source).toContain("cronEmailDueCapsules");
    expect(source).toContain("previewCapsuleSend");
    expect(source).toContain("capsuleEmailText");
    expect(source).toContain("to: [to]");
    const cycle = readFileSync(resolve(here, "../actions/cycle.ts"), "utf8");
    expect(cycle).toContain("ownerEmailFailed");
    const cron = readFileSync(resolve(here, "../app/api/cron/email/route.ts"), "utf8");
    expect(cron).toContain('searchParams.get("dry") === "1"');
  });
});
