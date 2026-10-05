export const SUBMIT_STATUSES = ["draft", "submitted"] as const;
export type SubmitStatus = (typeof SUBMIT_STATUSES)[number];

export const SUBMIT_INTENT_DRAFT = "draft";
export const SUBMIT_INTENT_SUBMIT = "submit";
export const LETTER_AUTOSAVE_MS = 2_000;

export function parseSubmitIntent(value: FormDataEntryValue | null | undefined): SubmitStatus {
  return String(value ?? "") === SUBMIT_INTENT_DRAFT ? "draft" : "submitted";
}

export function submissionHasContent(body: string, photoCount: number): boolean {
  return body.trim().length > 0 || photoCount > 0;
}

/**
 * After a successful save, keep the posted letter. Do not fall back to an
 * empty first-paint `initialBody` (React 19 resets uncontrolled fields).
 * Returning to the form uses `initialBody` from the same submission row.
 */
export function visibleSubmitLetter(input: {
  initialBody: string;
  currentBody: string;
  justSaved: boolean;
  savedBody?: string;
}): string {
  if (input.justSaved) {
    return input.savedBody ?? input.currentBody;
  }
  if (input.currentBody.length > 0) return input.currentBody;
  return input.initialBody;
}

export function isIncludedInCapsule(submission: { status?: string | null }): boolean {
  return (submission.status ?? "submitted") === "submitted";
}

export function includedSubmissions<T extends { status?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter(isIncludedInCapsule);
}

export function writtenCount(rows: readonly { status?: string | null }[]): number {
  return includedSubmissions(rows).length;
}

const SMALL = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

export function countWord(n: number): string {
  if (n >= 0 && n < SMALL.length) return SMALL[n]!;
  return String(n);
}

export function writtenCountPhrase(written: number, total: number): string {
  const verb = written === 1 ? "has" : "have";
  return `${capitalize(countWord(written))} of ${countWord(total)} ${verb} written`;
}

export function missedCountPhrase(missed: number): string {
  if (missed <= 0) return "Everyone wrote this month.";
  if (missed === 1) return "One person did not write this month.";
  return `${capitalize(countWord(missed))} people did not write this month.`;
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function nextSubmissionWrite(input: {
  existing: { status?: string | null } | null;
  body: string;
  intent: SubmitStatus;
  now: string;
}): { body: string; status: SubmitStatus; updated_at: string; submitted_at?: string } {
  const patch: {
    body: string;
    status: SubmitStatus;
    updated_at: string;
    submitted_at?: string;
  } = {
    body: input.body,
    status: input.intent,
    updated_at: input.now,
  };

  const alreadySubmitted = (input.existing?.status ?? null) === "submitted";
  if (input.intent === "submitted" && !alreadySubmitted) {
    patch.submitted_at = input.now;
  }
  if (!input.existing) {
    patch.submitted_at = input.now;
  }

  return patch;
}

/**
 * Autosave is letter text only, as a draft for this account + group + period.
 * It never promotes a letter, and it never demotes an already-submitted one.
 */
export function nextAutosaveWrite(input: {
  existing: { status?: string | null } | null;
  body: string;
  now: string;
}):
  | { skip: true; status: SubmitStatus }
  | { skip: false; status: "draft"; patch: ReturnType<typeof nextSubmissionWrite> } {
  if ((input.existing?.status ?? null) === "submitted") {
    return { skip: true, status: "submitted" };
  }
  return {
    skip: false,
    status: "draft",
    patch: nextSubmissionWrite({
      existing: input.existing,
      body: input.body,
      intent: "draft",
      now: input.now,
    }),
  };
}

export function shouldAutosaveLetter(input: {
  closed: boolean;
  submitted: boolean;
  explicitBusy: boolean;
  currentBody: string;
  lastSavedBody: string;
}): boolean {
  if (input.closed || input.submitted || input.explicitBusy) return false;
  return input.currentBody !== input.lastSavedBody;
}

/** Postgres unique_violation — submissions (month_id, member_id). */
export const POSTGRES_UNIQUE_VIOLATION = "23505";

export function isUniqueConstraintError(error: { code?: string | null } | null | undefined): boolean {
  return String(error?.code ?? "") === POSTGRES_UNIQUE_VIOLATION;
}

/**
 * Live-row guard for an autosave UPDATE. A submitted row keeps its status and
 * body even if the autosave started from a stale draft snapshot.
 */
export function applyAutosaveUpdate(input: {
  current: { status?: string | null; body: string };
  patch: { status: SubmitStatus; body: string };
}): { applied: boolean; row: { status: string; body: string } } {
  if ((input.current.status ?? null) === "submitted") {
    return {
      applied: false,
      row: { status: "submitted", body: input.current.body },
    };
  }
  return {
    applied: true,
    row: { status: input.patch.status, body: input.patch.body },
  };
}

/**
 * Live-row guard for an autosave INSERT. If another tab already wrote the
 * unique (month, member) row, skip — do not overwrite submitted text.
 */
export function applyAutosaveInsert(input: {
  current: { status?: string | null; body: string } | null;
  insert: { status: SubmitStatus; body: string };
}): { applied: boolean; uniqueConflict: boolean; row: { status: string; body: string } } {
  if (input.current) {
    return {
      applied: false,
      uniqueConflict: true,
      row: {
        status: input.current.status ?? "submitted",
        body: input.current.body,
      },
    };
  }
  return {
    applied: true,
    uniqueConflict: false,
    row: { status: input.insert.status, body: input.insert.body },
  };
}
