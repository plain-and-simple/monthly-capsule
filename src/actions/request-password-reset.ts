"use server";

import { LOGIN_RATE_LIMITED } from "@/lib/account";
import { appUrl } from "@/lib/env";
import { findAccountByEmail } from "@/lib/memberships";
import { sendPasswordResetEmail } from "@/lib/password-reset-mail";
import { forgotPasswordAck, parseForgotPasswordEmail, resetLink } from "@/lib/password-reset";
import { issuePasswordReset } from "@/lib/password-reset-store";
import {
  clientIp,
  passwordResetAttemptsBlocked,
  recordPasswordResetAttempt,
} from "@/lib/rate-limit";

export type RequestPasswordResetState =
  | { error: string }
  | { ok: true; message: string }
  | null;

export async function requestPasswordReset(
  _prev: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const parsed = parseForgotPasswordEmail(String(formData.get("email") ?? ""));
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  try {
    const ip = await clientIp();
    if (await passwordResetAttemptsBlocked(parsed.email, ip)) {
      return { error: LOGIN_RATE_LIMITED };
    }
    await recordPasswordResetAttempt(parsed.email, ip);

    const account = await findAccountByEmail(parsed.email);
    if (account) {
      const token = await issuePasswordReset(account.id);
      await sendPasswordResetEmail({
        to: account.email,
        preferredName: account.preferred_name,
        link: resetLink(appUrl(), token),
      });
    }

    return { ok: true, message: forgotPasswordAck(Boolean(account)) };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { ok: true, message: forgotPasswordAck(false) };
  }
}
