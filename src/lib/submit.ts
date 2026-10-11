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

export function newPhotoStorageNonce(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function photoStoragePath(input: {
  groupId: string;
  monthId: string;
  submissionId: string;
  sortOrder: number;
  ext: string;
  nonce: string;
}): string {
  return `${input.groupId}/${input.monthId}/${input.submissionId}/${input.nonce}-${input.sortOrder}.${input.ext}`;
}

export type StoredPhotoRef = {
  id: string;
  storage_path: string;
};

export function splitKeptAndDroppedPhotos(
  oldPhotos: readonly StoredPhotoRef[],
  keepPaths: readonly string[],
): { kept: StoredPhotoRef[]; dropped: StoredPhotoRef[] } {
  const kept = oldPhotos.filter((photo) => keepPaths.includes(photo.storage_path));
  const dropped = oldPhotos.filter((photo) => !keepPaths.includes(photo.storage_path));
  return { kept, dropped };
}

export type SubmitPhotoFailureStage = "compress" | "upload" | "insert";

export function submitPhotoFailureLog(input: {
  groupId: string;
  photoIndex: number;
  stage: SubmitPhotoFailureStage;
  error: unknown;
}): {
  message: string;
  context: {
    groupId: string;
    photoIndex: number;
    stage: SubmitPhotoFailureStage;
    errorName: string;
  };
} {
  const errorName =
    input.error instanceof Error
      ? input.error.name
      : typeof input.error === "object" && input.error && "name" in input.error
        ? String((input.error as { name?: string }).name ?? "Error")
        : "Error";
  return {
    message: "submitLetter photo failed",
    context: {
      groupId: input.groupId,
      photoIndex: input.photoIndex,
      stage: input.stage,
      errorName,
    },
  };
}

export function logSubmitPhotoFailure(input: {
  groupId: string;
  photoIndex: number;
  stage: SubmitPhotoFailureStage;
  error: unknown;
}): void {
  const log = submitPhotoFailureLog(input);
  console.error(log.message, log.context);
}

/**
 * After a failed Submit, keep the letter as a draft (so the text is not lost)
 * unless the row was already submitted. A resubmit failure leaves the earlier
 * submitted body and photos exactly as they were. Draft or missing rows stay
 * Not yet on the group-home roster.
 */
export function failedSubmitSnapshot(input: {
  existing: { status?: string | null; body: string } | null;
  attemptedBody: string;
  existingPhotos: readonly StoredPhotoRef[];
}): {
  persistDraft: boolean;
  status: SubmitStatus | null;
  body: string;
  photos: StoredPhotoRef[];
  rosterSubmitted: boolean;
} {
  const alreadySubmitted = (input.existing?.status ?? null) === "submitted";
  if (alreadySubmitted) {
    return {
      persistDraft: false,
      status: "submitted",
      body: input.existing!.body,
      photos: [...input.existingPhotos],
      rosterSubmitted: true,
    };
  }
  return {
    persistDraft: true,
    status: "draft",
    body: input.attemptedBody,
    photos: [...input.existingPhotos],
    rosterSubmitted: false,
  };
}

/** Submitted status is last. Dropped photos are deleted only after that write. */
export const SUBMIT_COMMIT_ORDER = [
  "persist_draft",
  "compress",
  "upload",
  "insert_photos",
  "write_submitted",
  "delete_dropped",
] as const;

export type SubmitPhotoBytes = {
  buffer: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
};

export type SubmitPhotoRow = {
  submission_id: string;
  storage_path: string;
  width: number;
  height: number;
  bytes: number;
  sort_order: number;
};

export type SubmitCommitDeps = {
  compressFile: (index: number, bytes: Uint8Array) => Promise<SubmitPhotoBytes>;
  uploadPhoto: (
    path: string,
    photo: SubmitPhotoBytes,
  ) => Promise<{ error?: { name?: string } | null }>;
  loadPhotos: (submissionId: string) => Promise<StoredPhotoRef[]>;
  insertPhotoRows: (rows: SubmitPhotoRow[]) => Promise<{ error?: { name?: string } | null }>;
  writeSubmission: (input: {
    existingId?: string;
    patch: ReturnType<typeof nextSubmissionWrite>;
  }) => Promise<{ id: string } | { error: string }>;
  deleteDroppedPhotos: (dropped: StoredPhotoRef[]) => Promise<void>;
  cleanupUploads: (paths: string[]) => Promise<void>;
  rollbackNewPhotos: (paths: string[]) => Promise<void>;
  makeNonce: () => string;
  photoExt: (contentType: string) => string;
  logPhotoFailure: (input: {
    photoIndex: number;
    stage: SubmitPhotoFailureStage;
    error: unknown;
  }) => void;
};

const COMPRESS_FAILED = "Could not compress that photo. Try another.";

/**
 * Photo work first. Mark submitted only after uploads and photo rows succeed.
 * A first Submit that later fails still keeps the letter as a draft. A failed
 * resubmit does not rewrite the earlier submitted body or photos.
 */
export async function runSubmitPhotoCommit(input: {
  existing: { id: string; status: string | null; body: string } | null;
  body: string;
  intent: SubmitStatus;
  fileCount: number;
  keepPaths: string[];
  photosTouched: boolean;
  now: string;
  groupId: string;
  monthId: string;
  readFileBytes: (index: number) => Promise<Uint8Array>;
  deps: SubmitCommitDeps;
}): Promise<{ ok: true; status: SubmitStatus } | { error: string }> {
  const alreadySubmitted = (input.existing?.status ?? null) === "submitted";
  const needsPhotoWork = input.fileCount > 0 || input.photosTouched;

  let existingId = input.existing?.id;
  let existingStatus = input.existing?.status ?? null;

  if (needsPhotoWork && !alreadySubmitted) {
    const draftPatch = nextSubmissionWrite({
      existing: input.existing ? { status: input.existing.status } : null,
      body: input.body,
      intent: "draft",
      now: input.now,
    });
    const saved = await input.deps.writeSubmission({ existingId, patch: draftPatch });
    if ("error" in saved) return { error: saved.error };
    existingId = saved.id;
    existingStatus = "draft";
  }

  if (!needsPhotoWork) {
    const patch = nextSubmissionWrite({
      existing: input.existing ? { status: input.existing.status } : null,
      body: input.body,
      intent: input.intent,
      now: input.now,
    });
    const written = await input.deps.writeSubmission({
      existingId: input.existing?.id,
      patch,
    });
    if ("error" in written) return { error: written.error };
    return { ok: true, status: input.intent };
  }

  const compressed: SubmitPhotoBytes[] = [];
  for (let i = 0; i < input.fileCount; i += 1) {
    try {
      const bytes = await input.readFileBytes(i);
      compressed.push(await input.deps.compressFile(i, bytes));
    } catch (error) {
      input.deps.logPhotoFailure({ photoIndex: i, stage: "compress", error });
      const message = error instanceof Error && error.message ? error.message : COMPRESS_FAILED;
      return { error: message };
    }
  }

  if (!existingId) {
    return { error: "Could not save." };
  }

  const oldPhotos = await input.deps.loadPhotos(existingId);
  const { kept, dropped } = splitKeptAndDroppedPhotos(oldPhotos, input.keepPaths);
  const uploadedPaths: string[] = [];
  const rows: SubmitPhotoRow[] = [];

  for (let i = 0; i < compressed.length; i += 1) {
    const photo = compressed[i]!;
    const storagePath = photoStoragePath({
      groupId: input.groupId,
      monthId: input.monthId,
      submissionId: existingId,
      sortOrder: kept.length + i,
      ext: input.deps.photoExt(photo.contentType),
      nonce: input.deps.makeNonce(),
    });
    const { error: uploadError } = await input.deps.uploadPhoto(storagePath, photo);
    if (uploadError) {
      input.deps.logPhotoFailure({ photoIndex: i, stage: "upload", error: uploadError });
      await input.deps.cleanupUploads(uploadedPaths);
      return { error: "Could not store photo." };
    }
    uploadedPaths.push(storagePath);
    rows.push({
      submission_id: existingId,
      storage_path: storagePath,
      width: photo.width,
      height: photo.height,
      bytes: photo.bytes,
      sort_order: kept.length + i,
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await input.deps.insertPhotoRows(rows);
    if (insertError) {
      input.deps.logPhotoFailure({ photoIndex: 0, stage: "insert", error: insertError });
      await input.deps.cleanupUploads(uploadedPaths);
      return { error: "Could not save photos." };
    }
  }

  const patch = nextSubmissionWrite({
    existing: { status: existingStatus },
    body: input.body,
    intent: input.intent,
    now: input.now,
  });
  const written = await input.deps.writeSubmission({ existingId, patch });
  if ("error" in written) {
    await input.deps.rollbackNewPhotos(uploadedPaths);
    return { error: written.error };
  }

  await input.deps.deleteDroppedPhotos(dropped);
  return { ok: true, status: input.intent };
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
