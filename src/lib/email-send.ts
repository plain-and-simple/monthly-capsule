import { createHash } from "crypto";

/** j***@gmail.com — logs keep the domain, not the mailbox. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  return `${trimmed.slice(0, 1)}***${trimmed.slice(at)}`;
}

export function capsuleDeliveryHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** Stable for the life of a capsule recipient. Resend dedupes retries that race the database claim. */
export function capsuleSendKey(capsuleId: string, email: string): string {
  return `capsule-${capsuleId}-${capsuleDeliveryHash(email).slice(0, 32)}`;
}

export function capsuleForceSendKey(capsuleId: string, email: string, at: string): string {
  return `${capsuleSendKey(capsuleId, email)}-force-${at}`;
}

export function cycleSendKey(input: {
  kind: string;
  groupId: string;
  yearMonth: string;
  memberId: string;
}): string {
  return `cycle-${input.kind}-${input.groupId}-${input.yearMonth}-${input.memberId}`;
}
