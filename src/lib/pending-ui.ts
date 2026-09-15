/** Client hard timeout: primary buttons must leave pending by this mark. */
export const CLIENT_PENDING_GUARD_MS = 12_000;

export function pendingTimedOut(
  startedAt: number,
  now: number,
  guardMs = CLIENT_PENDING_GUARD_MS,
): boolean {
  return now - startedAt >= guardMs;
}

/** Remaining ms until the pending guard. Does not reset when `rawBusy` flickers true. */
export function pendingGuardRemainingMs(
  startedAt: number,
  now: number,
  guardMs = CLIENT_PENDING_GUARD_MS,
): number {
  return Math.max(0, guardMs - (now - startedAt));
}

/**
 * HTML `disabled` on the submit control cancels the in-flight POST / action
 * (React 19). Pending UI must use aria-busy only.
 */
export function submitBusyDisablesControl(): boolean {
  return false;
}
