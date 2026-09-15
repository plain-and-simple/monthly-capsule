/** Client hard timeout: primary buttons must leave pending by this mark. */
export const CLIENT_PENDING_GUARD_MS = 12_000;

export function pendingTimedOut(
  startedAt: number,
  now: number,
  guardMs = CLIENT_PENDING_GUARD_MS,
): boolean {
  return now - startedAt >= guardMs;
}
