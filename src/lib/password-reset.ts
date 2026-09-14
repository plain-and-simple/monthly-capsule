import { createHash, randomBytes } from "crypto";
import {
  EMAIL_INVALID,
  EMAIL_REQUIRED,
  parseEmail,
  passwordError,
} from "@/lib/account";
import { RESET_TOKEN_BYTES, RESET_TOKEN_TTL_MS } from "@/lib/constants";
import {
  FORGOT_PASSWORD_ACK,
  RESET_LINK_INVALID,
} from "@/lib/copy";

export function generateResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function resetTokenExpiresAt(now: Date, ttlMs = RESET_TOKEN_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs);
}

export function isResetTokenExpired(expiresAt: string | Date, now: Date): boolean {
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return exp.getTime() <= now.getTime();
}

export function isResetTokenUsable(
  row: { usedAt: string | Date | null; expiresAt: string | Date },
  now: Date,
): boolean {
  if (row.usedAt) return false;
  return !isResetTokenExpired(row.expiresAt, now);
}

export function passwordResetInsert(input: {
  accountId: string;
  token: string;
  now: Date;
  ttlMs?: number;
}): { account_id: string; token_hash: string; expires_at: string } {
  return {
    account_id: input.accountId,
    token_hash: hashResetToken(input.token),
    expires_at: resetTokenExpiresAt(input.now, input.ttlMs ?? RESET_TOKEN_TTL_MS).toISOString(),
  };
}

export function resetPath(token: string): string {
  return `/reset/${encodeURIComponent(token)}`;
}

export function resetLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${resetPath(token)}`;
}

/** Same copy whether the email has an account. Do not branch the response. */
export function forgotPasswordAck(_accountExists: boolean): string {
  void _accountExists;
  return FORGOT_PASSWORD_ACK;
}

export function parseForgotPasswordEmail(
  email: string,
): { email: string } | { error: string } {
  if (!email.trim()) {
    return { error: EMAIL_REQUIRED };
  }
  const parsed = parseEmail(email);
  if (!parsed) {
    return { error: EMAIL_INVALID };
  }
  return { email: parsed };
}

export function parseResetPassword(
  password: string,
): { password: string } | { error: string } {
  const error = passwordError(password);
  if (error) {
    return { error };
  }
  return { password };
}

export function invalidResetMessage(): string {
  return RESET_LINK_INVALID;
}
