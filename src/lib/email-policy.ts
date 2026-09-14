export type CapsuleEmailFlags = {
  email_sent_at: string | null;
  email_held: boolean;
};

export type CronCapsuleCandidate = CapsuleEmailFlags & {
  yearMonth: string;
  version: number;
};

/** Cron email_day: send only when unused force-skip and not yet sent. */
export function cronShouldSendCapsule(capsule: CapsuleEmailFlags): boolean {
  return !capsule.email_sent_at && !capsule.email_held;
}

/** YYYY-MM string compare: due or overdue vs the calendar email target. */
export function capsuleYearMonthIsDue(yearMonth: string, dueYearMonth: string): boolean {
  return yearMonth <= dueYearMonth;
}

/**
 * Cron catch-up: every compiled edition at or before email_day's target month.
 * Force-compiled future months wait for that month's email_day (or owner Send).
 */
export function cronEmailDueCapsules(
  dueYearMonth: string,
  capsules: readonly CronCapsuleCandidate[],
): CronCapsuleCandidate[] {
  return capsules
    .filter((capsule) => capsuleYearMonthIsDue(capsule.yearMonth, dueYearMonth) && cronShouldSendCapsule(capsule))
    .slice()
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || a.version - b.version);
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

/** Locked From display. Mailbox must be a domain verified in Resend. */
export const CAPSULE_FROM_DISPLAY = "Capsule";
export const DEFAULT_RESEND_FROM = `${CAPSULE_FROM_DISPLAY} <capsules@plainandsimple.app>`;

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
  configuredFrom: string,
): { ok: true; from: string; email: string } | { ok: false; error: string } {
  const email = extractResendFromEmail(configuredFrom);
  if (!email) {
    return { ok: false, error: "From address is not a valid email." };
  }
  return { ok: true, email, from: `${CAPSULE_FROM_DISPLAY} <${email}>` };
}

export function previewCapsuleSend(input: {
  fromOk: boolean;
  fromError?: string;
  hasResendKey: boolean;
  recipientCount: number;
  skippedNoEmail: number;
}): {
  canSend: boolean;
  reason: "ok" | "bad-from" | "no-resend-key" | "no-recipients";
  wouldSend: number;
  skippedNoEmail: number;
  error: string | null;
} {
  const skippedNoEmail = input.skippedNoEmail;
  if (!input.fromOk) {
    return {
      canSend: false,
      reason: "bad-from",
      wouldSend: 0,
      skippedNoEmail,
      error: input.fromError || "From address is not a valid email.",
    };
  }
  if (!input.hasResendKey) {
    return {
      canSend: false,
      reason: "no-resend-key",
      wouldSend: 0,
      skippedNoEmail,
      error: "Email is not configured.",
    };
  }
  if (input.recipientCount === 0) {
    return {
      canSend: false,
      reason: "no-recipients",
      wouldSend: 0,
      skippedNoEmail,
      error: skippedNoEmail > 0 ? null : "No members to email.",
    };
  }
  return {
    canSend: true,
    reason: "ok",
    wouldSend: input.recipientCount,
    skippedNoEmail,
    error: null,
  };
}

export function formatSkippedNoEmail(input: {
  skippedNoEmail: number;
  skippedNames?: readonly string[];
}): string | null {
  if (input.skippedNoEmail <= 0) return null;
  const names = (input.skippedNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (names.length > 0) {
    return `Skipped ${input.skippedNoEmail} with no email: ${names.join(", ")}.`;
  }
  return `Skipped ${input.skippedNoEmail} with no email.`;
}

/** Owner Send is success only when Resend accepted every attempted address. */
export function ownerEmailFailed(result: { markedSent: boolean }): boolean {
  return !result.markedSent;
}

export function formatCapsuleSendResult(input: {
  sent: number;
  skippedNoEmail: number;
  skippedNames?: readonly string[];
  error: string | null;
}): string {
  const bits = [`Sent ${input.sent}.`];
  const skipped = formatSkippedNoEmail(input);
  if (skipped) bits.push(skipped);
  if (input.error) {
    bits.push(`Resend error: ${input.error}`);
  }
  return bits.join(" ");
}
