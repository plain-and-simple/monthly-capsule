import "server-only";
import { Resend } from "resend";
import { alertEmail, resendApiKey, resendFromEmail } from "@/lib/env";
import {
  buildOpsAlertEmail,
  decideOpsAlert,
  markOpsAlertSent,
  opsAlertType,
  type OpsAlertInput,
} from "@/lib/ops-alert";
import { RESEND_TIMEOUT_MESSAGE, resendSendAccepted } from "@/lib/email-policy";
import { withTimeout } from "@/lib/with-timeout";

const OPS_ALERT_SEND_TIMEOUT_MS = 2_000;

function publicAlertFields(input: OpsAlertInput) {
  return {
    route: input.route,
    code: opsAlertType(input.code),
    groupId: input.groupId,
    memberId: input.memberId,
    at: input.at ?? new Date().toISOString(),
  };
}

/** Fire an ops email. Never includes letter text. Never throws to the caller. */
export async function reportOpsAlert(input: OpsAlertInput): Promise<void> {
  const fields = publicAlertFields(input);
  try {
    const to = alertEmail();
    const decision = decideOpsAlert({ alertTo: to, code: fields.code });
    if (decision === "skipped_unset") {
      console.warn("ops alert skipped: ALERT_EMAIL unset", fields);
      return;
    }
    if (decision === "throttled") {
      console.info("ops alert throttled", fields);
      return;
    }
    if (!to) {
      console.warn("ops alert skipped: ALERT_EMAIL unset", fields);
      return;
    }
    const key = resendApiKey();
    if (!key) {
      console.warn("ops alert skipped: RESEND_API_KEY unset", fields);
      return;
    }
    const email = buildOpsAlertEmail({ ...input, ...fields });
    const resend = new Resend(key);
    const result = await withTimeout(
      resend.emails.send({
        from: resendFromEmail(),
        to: [to],
        subject: email.subject,
        text: email.text,
      }),
      OPS_ALERT_SEND_TIMEOUT_MS,
      RESEND_TIMEOUT_MESSAGE,
    );
    const interpreted = resendSendAccepted(result);
    if (!interpreted.ok) {
      console.error("ops alert resend rejected", interpreted.message);
      return;
    }
    markOpsAlertSent(fields.code, Date.now());
  } catch (caught) {
    console.error("ops alert failed", caught instanceof Error ? caught.message : "error");
  }
}
