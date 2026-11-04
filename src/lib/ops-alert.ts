export const OPS_ALERT_THROTTLE_MS = 10 * 60 * 1000;

export type OpsAlertInput = {
  route: string;
  code: string;
  groupId: string | null;
  memberId: string | null;
  at?: string;
};

export type OpsAlertEmail = {
  subject: string;
  text: string;
};

export type OpsAlertDecision = "send" | "throttled" | "skipped_unset";

const lastSentAt = new Map<string, number>();

export function resetOpsAlertThrottle(): void {
  lastSentAt.clear();
}

export function opsAlertType(code: string | null | undefined): string {
  const trimmed = String(code ?? "").trim();
  return trimmed || "unknown";
}

export function shouldSendOpsAlert(
  type: string,
  now: number,
  windowMs: number = OPS_ALERT_THROTTLE_MS,
  store: Map<string, number> = lastSentAt,
): boolean {
  const previous = store.get(type);
  if (previous != null && now - previous < windowMs) return false;
  return true;
}

export function markOpsAlertSent(
  type: string,
  now: number,
  store: Map<string, number> = lastSentAt,
): void {
  store.set(type, now);
}

export function buildOpsAlertEmail(input: OpsAlertInput): OpsAlertEmail {
  const at = input.at ?? new Date().toISOString();
  const code = opsAlertType(input.code);
  const route = input.route || "unknown";
  const groupId = input.groupId || "unknown";
  const memberId = input.memberId || "unknown";
  const text = [
    "route: " + route,
    "error_code: " + code,
    "group_id: " + groupId,
    "member_id: " + memberId,
    "time: " + at,
  ].join("\n");
  return {
    subject: "Capsule ops alert (" + code + ")",
    text,
  };
}

export function decideOpsAlert(input: {
  alertTo: string | null | undefined;
  code: string;
  now?: number;
}): OpsAlertDecision {
  const to = String(input.alertTo ?? "").trim();
  if (!to) return "skipped_unset";
  const type = opsAlertType(input.code);
  if (!shouldSendOpsAlert(type, input.now ?? Date.now())) return "throttled";
  return "send";
}
