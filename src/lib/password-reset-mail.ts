import "server-only";
import { Resend } from "resend";
import { passwordResetEmailHtml, passwordResetEmailSubject } from "@/lib/password-reset-email";
import { RESEND_SEND_TIMEOUT_MS, RESEND_TIMEOUT_MESSAGE, resendSendAccepted } from "@/lib/email-policy";
import { resendApiKey, resendFromEmail } from "@/lib/env";
import { withTimeout } from "@/lib/with-timeout";

export async function sendPasswordResetEmail(input: {
  to: string;
  preferredName: string;
  link: string;
}): Promise<{ sent: boolean }> {
  const key = resendApiKey();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[password-reset] Resend unset. Reset URL:", input.link);
    }
    return { sent: false };
  }

  const resend = new Resend(key);
  try {
    const result = await withTimeout(
      resend.emails.send({
        from: resendFromEmail(),
        to: input.to,
        subject: passwordResetEmailSubject(),
        html: passwordResetEmailHtml({
          preferredName: input.preferredName,
          link: input.link,
        }),
      }),
      RESEND_SEND_TIMEOUT_MS,
      RESEND_TIMEOUT_MESSAGE,
    );
    const interpreted = resendSendAccepted(result);
    if (!interpreted.ok) {
      console.error("password reset resend rejected", interpreted.message);
      return { sent: false };
    }
    return { sent: true };
  } catch (caught) {
    console.error(
      "password reset resend failed",
      caught instanceof Error ? caught.message : caught,
    );
    return { sent: false };
  }
}
