import { EMAIL_INVALID, parseEmail, passwordError } from "@/lib/account";

export const FIELD_IDLE_MS = 3_000;
export const PASSWORD_HINT = "At least 8 characters.";

export function emailFieldError(value: string): string | null {
  if (!value.trim()) return null;
  return parseEmail(value) ? null : EMAIL_INVALID;
}

export function passwordFieldError(value: string): string | null {
  if (!value) return null;
  return passwordError(value);
}
