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
 * Disable the submit control only after React reports the request in flight
 * (`useFormStatus().pending`). Do not disable on the initiating click or on
 * `markBusy` — that cancels a native POST, and disabled named fields are omitted
 * from FormData so login looks like a wrong password.
 */
export function submitBusyDisablesControl(actionPending: boolean): boolean {
  return actionPending;
}
