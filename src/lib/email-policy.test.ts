import { describe, expect, it } from "vitest";
import {
  cronShouldSendCapsule,
  holdEmailUpdate,
  ownerCanEmailCapsule,
  sentEmailUpdate,
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
