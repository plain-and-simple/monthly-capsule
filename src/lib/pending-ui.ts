/** Hung native POST / navigation fallback. Server actions clear busy when pending drops. */
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
 * Disable the submit control once the request is in flight.
 * Do not disable on the initiating click — that cancels the native POST.
 */
export function submitBusyDisablesControl(inFlight: boolean): boolean {
  return inFlight;
}
