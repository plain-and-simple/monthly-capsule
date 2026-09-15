/** Auto-dismiss window for mutation success toasts (4–6s band). */
export const TOAST_DISMISS_MS = 5_000;

export type ToastTone = "success" | "danger";

export function toastDismissed(
  shownAt: number,
  now: number,
  dismissMs = TOAST_DISMISS_MS,
): boolean {
  return now - shownAt >= dismissMs;
}
