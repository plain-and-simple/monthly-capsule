export type CapsuleEmailFlags = {
  email_sent_at: string | null;
  email_held: boolean;
};

/** Cron email_day: send only when unused force-skip and not yet sent. */
export function cronShouldSendCapsule(capsule: CapsuleEmailFlags): boolean {
  return !capsule.email_sent_at && !capsule.email_held;
}

export function ownerCanEmailCapsule(capsule: Pick<CapsuleEmailFlags, "email_sent_at">): boolean {
  return !capsule.email_sent_at;
}

export function holdEmailUpdate(): { email_held: true } {
  return { email_held: true };
}

export function sentEmailUpdate(at: string): { email_sent_at: string; email_held: false } {
  return { email_sent_at: at, email_held: false };
}

/** Designer mailbox. Must be a domain verified in Resend. */
export const DEFAULT_RESEND_FROM = "Plain and Simple <capsules@plainandsimple.app>";

export type ResendSendLook = {
  data?: { id?: string } | null;
  error?: { message?: string; name?: string } | null;
};

export function resendSendAccepted(
  result: ResendSendLook,
): { ok: true; id: string } | { ok: false; message: string } {
  if (result.error) {
    return {
      ok: false,
      message: result.error.message || result.error.name || "Resend rejected the send",
    };
  }
  const id = result.data?.id;
  if (!id) {
    return { ok: false, message: "Resend did not accept the send" };
  }
  return { ok: true, id };
}

export function shouldMarkCapsuleEmailed(input: { attempted: number; accepted: number }): boolean {
  return input.attempted > 0 && input.accepted === input.attempted;
}

export function extractResendFromEmail(value: string): string | null {
  const trimmed = value.trim();
  const angled = /<([^>]+)>/.exec(trimmed);
  const raw = (angled?.[1] ?? trimmed).trim().toLowerCase();
  if (!raw || !raw.includes("@") || raw.length > 254) return null;
  return raw;
}

export function capsuleFromHeader(
  groupName: string,
  configuredFrom: string,
): { ok: true; from: string; email: string } | { ok: false; error: string } {
  const email = extractResendFromEmail(configuredFrom);
  if (!email) {
    return { ok: false, error: "From address is not a valid email." };
  }
  const display = groupName.trim() || "Plain and Simple";
  return { ok: true, email, from: `${display} via Plain and Simple <${email}>` };
}

export function formatCapsuleSendResult(input: {
  sent: number;
  skippedNoEmail: number;
  error: string | null;
  reason?:
    | "ok"
    | "no-month"
    | "no-capsule"
    | "already-sent"
    | "held"
    | "no-resend-key"
    | "bad-from"
    | "no-recipients"
    | "resend-error";
}): string {
  if (input.reason === "no-resend-key") {
    return "Email is not configured (missing Resend API key). Nothing was sent.";
  }
  if (input.reason === "bad-from") {
    return input.error
      ? `From address problem: ${input.error}`
      : "From address is not configured correctly. Nothing was sent.";
  }
  if (input.reason === "no-recipients") {
    return `Nobody has an email yet. Skipped ${input.skippedNoEmail} with no address.`;
  }
  const bits = [`Sent ${input.sent}.`];
  if (input.skippedNoEmail > 0) {
    bits.push(`Skipped ${input.skippedNoEmail} with no email.`);
  }
  if (input.error) {
    bits.push(`Resend error: ${input.error}`);
  }
  return bits.join(" ");
}
