import { createHash } from "crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EMAIL_INVALID,
  EMAIL_REQUIRED,
  PASSWORD_TOO_SHORT,
} from "./account";
import { RESET_TOKEN_BYTES, RESET_TOKEN_TTL_MS } from "./constants";
import { FORGOT_PASSWORD_ACK, RESET_LINK_INVALID } from "./copy";
import {
  forgotPasswordAck,
  generateResetToken,
  hashResetToken,
  invalidResetMessage,
  isResetTokenExpired,
  isResetTokenUsable,
  parseForgotPasswordEmail,
  parseResetPassword,
  passwordResetInsert,
  resetLink,
  resetPath,
  resetTokenExpiresAt,
} from "./password-reset";

const here = dirname(fileURLToPath(import.meta.url));

describe("password reset tokens", () => {
  it("mints URL-safe secrets and stores only the SHA-256 hash", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").length).toBe(RESET_TOKEN_BYTES);

    const hashed = hashResetToken(token);
    expect(hashed).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(token);

    const other = generateResetToken();
    expect(other).not.toBe(token);
    expect(hashResetToken(other)).not.toBe(hashed);
    expect(hashResetToken(token)).toBe(hashed);
  });

  it("builds a persistable row without the raw token", () => {
    const now = new Date("2026-09-14T18:00:00.000Z");
    const token = "test-token";
    const row = passwordResetInsert({
      accountId: "acct-1",
      token,
      now,
    });
    expect(row).toEqual({
      account_id: "acct-1",
      token_hash: hashResetToken(token),
      expires_at: "2026-09-14T19:00:00.000Z",
    });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
    expect(resetTokenExpiresAt(now).toISOString()).toBe(row.expires_at);
    expect(resetPath(token)).toBe("/reset/test-token");
    expect(resetLink("https://capsule.plainandsimple.app/", token)).toBe(
      "https://capsule.plainandsimple.app/reset/test-token",
    );
  });

  it("treats used or expired tokens as unusable (single-use, short-lived)", () => {
    const now = new Date("2026-09-14T18:00:00.000Z");
    const later = "2026-09-14T19:00:00.000Z";
    expect(isResetTokenUsable({ usedAt: null, expiresAt: later }, now)).toBe(true);
    expect(isResetTokenUsable({ usedAt: now, expiresAt: later }, now)).toBe(false);
    expect(isResetTokenUsable({ usedAt: null, expiresAt: now }, now)).toBe(false);
    expect(isResetTokenExpired(later, now)).toBe(false);
    expect(isResetTokenExpired(now, now)).toBe(true);
    expect(invalidResetMessage()).toBe(RESET_LINK_INVALID);
  });
});

describe("password reset request parsing and ack", () => {
  it("normalizes email and rejects empty or malformed without leaking accounts", () => {
    expect(parseForgotPasswordEmail("  Ada@Example.com ")).toEqual({
      email: "ada@example.com",
    });
    expect(parseForgotPasswordEmail("")).toEqual({ error: EMAIL_REQUIRED });
    expect(parseForgotPasswordEmail("not-an-email")).toEqual({ error: EMAIL_INVALID });
  });

  it("returns the same ack whether the account exists", () => {
    expect(forgotPasswordAck(true)).toBe(FORGOT_PASSWORD_ACK);
    expect(forgotPasswordAck(false)).toBe(FORGOT_PASSWORD_ACK);
    expect(forgotPasswordAck(true)).toBe(forgotPasswordAck(false));
  });

  it("reuses the 8-character password rule on the reset form", () => {
    expect(parseResetPassword("short")).toEqual({ error: PASSWORD_TOO_SHORT });
    expect(parseResetPassword("secret123")).toEqual({ password: "secret123" });
  });

  it("never branches the user-facing ack on account existence", () => {
    const source = readFileSync(resolve(here, "../actions/request-password-reset.ts"), "utf8");
    expect(source).toContain("forgotPasswordAck(Boolean(account))");
    expect(source).toContain("forgotPasswordAck(false)");
    expect(source).not.toMatch(/if \(account\)[\s\S]{0,80}return \{ ok: true/);
  });
});
