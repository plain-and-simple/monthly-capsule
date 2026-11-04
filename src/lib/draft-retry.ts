export const DRAFT_RETRY_BACKOFF_MS = [400, 800, 1600] as const;

export type RetryableSaveResult = {
  ok?: boolean;
  retry?: boolean;
  error?: string;
  status?: string;
} | null;

export function isRetryableSave(result: RetryableSaveResult): boolean {
  return Boolean(result && result.ok === false && result.retry === true);
}

export function draftRetryDelay(attempt: number): number {
  const last = DRAFT_RETRY_BACKOFF_MS.length - 1;
  const index = Math.max(0, Math.min(attempt, last));
  return DRAFT_RETRY_BACKOFF_MS[index]!;
}

export function canRetryDraftSave(attempt: number): boolean {
  return attempt < DRAFT_RETRY_BACKOFF_MS.length;
}
