"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveLetterDraft, submitLetter, type SubmitState } from "@/actions/submit";
import { MutationToast } from "@/components/app-toast";
import { PendingLink } from "@/components/pending-link";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { MAX_PHOTOS, PHOTO_FILE_ACCEPT } from "@/lib/constants";
import {
  GROUP_PRIMARY_VIEW,
  SUBMIT_AND_SEND,
  SUBMIT_CLOSED_HEADING,
  SUBMIT_DRAFT,
  SUBMIT_EMPTY,
  PHOTOS_MAX,
  SUBMIT_IN_AND_EDITABLE,
  SUBMIT_IN_HEADING,
  SUBMIT_PREPARING_PHOTOS,
  SUBMIT_RESTORED_UNSAVED,
  SUBMIT_SAVED_DRAFT,
  SUBMIT_DRAFT_SAVED,
  SUBMIT_SAVE_RETRYING,
  SUBMIT_STILL_EDITABLE,
} from "@/lib/copy";
import {
  canRetryDraftSave,
  draftRetryDelay,
  isRetryableSave,
} from "@/lib/draft-retry";
import {
  clearLocalLetterDraft,
  letterDraftStorageKey,
  readLocalLetterDraft,
  shouldRestoreLocalDraft,
  writeLocalLetterDraft,
} from "@/lib/draft-local";
import { appendPhotos, photoBatchFit } from "@/lib/photo-files";
import { detectPhotoFaces } from "@/lib/face-detect";
import { PHOTO_COMPRESS_FAILED, compressPhotoFile } from "@/lib/photo-compress";
import {
  letterAutosaveDelay,
  shouldAutosaveLetter,
  submissionHasContent,
  visibleSubmitLetter,
  type SubmitStatus,
} from "@/lib/submit";

type StagedPhoto = {
  id: string;
  preview: string;
  savedPath?: string;
  blob?: Blob;
  name?: string;
  width?: number;
  height?: number;
  /** New files only. Kept photos already stored their boxes. */
  faces?: Array<{ x: number; y: number; w: number; h: number }>;
};

export function SubmitForm({
  groupId,
  memberId,
  yearMonth,
  closed,
  initialBody,
  initialUpdatedAt = null,
  existingPhotos,
  initialStatus,
  title,
  closesPhrase,
  latestCapsuleHref,
  saveDraft = saveLetterDraft,
}: {
  groupId: string;
  memberId: string;
  yearMonth: string;
  closed: boolean;
  initialBody: string;
  initialUpdatedAt?: string | null;
  existingPhotos: Array<{ url: string; storagePath: string; width: number; height: number }>;
  initialStatus: SubmitStatus | null;
  title: string;
  closesPhrase: string;
  latestCapsuleHref?: string | null;
  saveDraft?: (groupId: string, body: string) => Promise<SubmitState>;
}) {
  const router = useRouter();
  const draftKey = letterDraftStorageKey({ groupId, yearMonth, memberId });
  const [body, setBody] = useState(initialBody);
  const savedBodyRef = useRef<string | null>(null);
  const lastSavedBodyRef = useRef(initialBody);
  const [draftHint, setDraftHint] = useState(initialStatus === "draft");
  const [autosaveStatus, setAutosaveStatus] = useState<SubmitStatus | null>(null);
  const [retryHint, setRetryHint] = useState(false);
  const [restoredNote, setRestoredNote] = useState(false);
  const firstSaveAttemptedRef = useRef(false);
  const lastFormDataRef = useRef<FormData | null>(null);
  const submitRetryRef = useRef(0);
  const [photos, setPhotos] = useState<StagedPhoto[]>(() =>
    existingPhotos.map((photo) => ({
      id: photo.storagePath,
      preview: photo.url,
      savedPath: photo.storagePath,
      width: photo.width,
      height: photo.height,
    })),
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLetter, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef(body);
  const closedRef = useRef(closed);
  const submittedRef = useRef(false);
  const autosaveGenRef = useRef(0);
  const initialSaved = existingPhotos.map((photo) => photo.storagePath).join("|");
  const explicitBusyRef = useRef(false);

  const status = state?.status ?? autosaveStatus ?? initialStatus;
  const submitted = status === "submitted";
  bodyRef.current = body;
  closedRef.current = closed;
  submittedRef.current = submitted;
  explicitBusyRef.current = busy;

  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  function commitBody(next: string) {
    setBody(next);
    if (typeof window !== "undefined") {
      writeLocalLetterDraft(window.localStorage, draftKey, next, new Date().toISOString());
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const local = readLocalLetterDraft(window.localStorage, draftKey);
    if (
      !local ||
      !shouldRestoreLocalDraft({
        local,
        serverBody: initialBody,
        serverUpdatedAt: initialUpdatedAt,
      })
    ) {
      return;
    }
    commitBody(local.body);
    setRestoredNote(true);
    // One restore on first paint for this group+month+member.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    setBody((current) =>
      visibleSubmitLetter({
        initialBody,
        currentBody: current,
        justSaved: false,
      }),
    );
  }, [initialBody]);

  useEffect(() => {
    if (state?.retry) {
      setRetryHint(true);
      return;
    }
    if (!state?.ok) return;
    lastSavedBodyRef.current = savedBodyRef.current ?? lastSavedBodyRef.current;
    if (state.status === "draft") setDraftHint(true);
    if (state.status === "submitted") {
      setDraftHint(false);
      if (typeof window !== "undefined") {
        clearLocalLetterDraft(window.localStorage, draftKey);
      }
    }
    setRetryHint(false);
    setRestoredNote(false);
    setBody((current) =>
      visibleSubmitLetter({
        initialBody,
        currentBody: current,
        justSaved: true,
        savedBody: savedBodyRef.current ?? current,
      }),
    );
  }, [state, initialBody, draftKey]);

  useEffect(() => {
    if (!state?.ok) return;
    router.refresh();
  }, [state, router]);

  const persistLetterDraft = useCallback(async () => {
    firstSaveAttemptedRef.current = true;
    const gen = ++autosaveGenRef.current;
    for (let attempt = 0; ; attempt++) {
      const text = bodyRef.current;
      if (
        !shouldAutosaveLetter({
          closed: closedRef.current,
          submitted: submittedRef.current,
          explicitBusy: explicitBusyRef.current,
          currentBody: text,
          lastSavedBody: lastSavedBodyRef.current,
        })
      ) {
        return;
      }
      const result = await saveDraft(groupId, text);
      if (gen !== autosaveGenRef.current) return;
      if (explicitBusyRef.current || submittedRef.current) return;
      if (result?.ok && result.status === "draft") {
        lastSavedBodyRef.current = text;
        setAutosaveStatus("draft");
        setDraftHint(true);
        setRetryHint(false);
        setRestoredNote(false);
        return;
      }
      if (!isRetryableSave(result) || !canRetryDraftSave(attempt)) {
        if (isRetryableSave(result)) setRetryHint(true);
        return;
      }
      setRetryHint(true);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, draftRetryDelay(attempt));
      });
      if (gen !== autosaveGenRef.current) return;
    }
  }, [groupId, saveDraft]);

  useEffect(() => {
    if (
      !shouldAutosaveLetter({
        closed,
        submitted,
        explicitBusy: busy,
        currentBody: body,
        lastSavedBody: lastSavedBodyRef.current,
      })
    ) {
      return;
    }
    const delay = letterAutosaveDelay(firstSaveAttemptedRef.current);
    const handle = window.setTimeout(() => {
      firstSaveAttemptedRef.current = true;
      void persistLetterDraft();
    }, delay);
    return () => window.clearTimeout(handle);
  }, [body, busy, closed, persistLetterDraft, submitted]);

  useEffect(() => {
    if (!state?.retry) {
      submitRetryRef.current = 0;
      return;
    }
    const data = lastFormDataRef.current;
    if (!data || !canRetryDraftSave(submitRetryRef.current)) return;
    const wait = draftRetryDelay(submitRetryRef.current);
    submitRetryRef.current += 1;
    const handle = window.setTimeout(() => {
      void action(data);
    }, wait);
    return () => window.clearTimeout(handle);
  }, [state, action]);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    const { keep, dropped } = photoBatchFit(photos.length, files.length, MAX_PHOTOS);
    const kept = files.slice(0, keep);
    if (kept.length === 0) {
      setPhotoError(dropped > 0 ? PHOTOS_MAX : null);
      return;
    }
    setPreparingPhotos(true);
    try {
      const next = await Promise.all(
        kept.map(async (file) => {
          const photo = await compressPhotoFile(file);
          const faces = await detectPhotoFaces(photo.blob);
          return {
            id: `${photo.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            preview: URL.createObjectURL(photo.blob),
            blob: photo.blob,
            name: photo.name,
            width: photo.width,
            height: photo.height,
            faces,
          } satisfies StagedPhoto;
        }),
      );
      setPhotos((current) => appendPhotos(current, next, MAX_PHOTOS));
      setPhotoError(dropped > 0 ? PHOTOS_MAX : null);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : PHOTO_COMPRESS_FAILED);
    } finally {
      setPreparingPhotos(false);
    }
  }

  const buttonBusy = busy || preparingPhotos;
  const submitPendingLabel = preparingPhotos
    ? SUBMIT_PREPARING_PHOTOS
    : photos.some((photo) => photo.blob)
      ? "Uploading…"
      : "Submitting…";
  const draftPendingLabel = preparingPhotos ? SUBMIT_PREPARING_PHOTOS : "Saving…";

  const statusLine = submitted
    ? null
    : retryHint
      ? SUBMIT_SAVE_RETRYING
      : draftHint || status === "draft"
        ? SUBMIT_DRAFT_SAVED
        : null;
  const toastMessage =
    state?.ok && status === "draft"
      ? SUBMIT_SAVED_DRAFT
      : state?.ok && submitted
        ? SUBMIT_IN_AND_EDITABLE
        : null;
  const keptPaths = photos.map((photo) => photo.savedPath).filter(Boolean) as string[];
  const photosTouched = keptPaths.join("|") !== initialSaved || photos.some((photo) => photo.blob);

  if (closed) {
    return (
      <div className="stack">
        <h1>{SUBMIT_CLOSED_HEADING}</h1>
        <p className="muted">This window is closed. You can read the capsule when it is ready.</p>
        <PendingLink className="backlink" href={`/g/${groupId}`} pendingLabel="Opening…">
          ← Back to the group
        </PendingLink>
        {latestCapsuleHref ? (
          <PendingLink className="btn btn--primary" href={latestCapsuleHref} pendingLabel="Opening…">
            {GROUP_PRIMARY_VIEW}
          </PendingLink>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="stack stack--loose"
      aria-busy={buttonBusy || undefined}
      onSubmit={markBusy}
      action={async (formData) => {
        const intent = String(formData.get("intent") ?? "");
        const posted = String(formData.get("body") ?? "");
        if (intent !== "draft" && !submissionHasContent(posted, photos.length)) {
          setPhotoError(SUBMIT_EMPTY);
          return;
        }
        setPhotoError(null);
        markBusy();
        autosaveGenRef.current += 1;
        savedBodyRef.current = posted;
        commitBody(posted);
        formData.set("groupId", groupId);
        formData.set("body", posted);
        if (photosTouched) formData.set("photos_touched", "1");
        keptPaths.forEach((path) => formData.append("keep_path", path));
        const newFaces: Array<Array<{ x: number; y: number; w: number; h: number }>> = [];
        photos.forEach((photo) => {
          if (!photo.blob || !photo.name) return;
          const file = new File([photo.blob], photo.name, {
            type: photo.blob.type || "image/jpeg",
          });
          formData.append("photos", file);
          newFaces.push(photo.faces ?? []);
        });
        if (newFaces.length > 0) formData.set("photo_faces", JSON.stringify(newFaces));
        lastFormDataRef.current = formData;
        return action(formData);
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <div className="stack stack--tight">
        <div className="row row--between">
          <h1>{title}</h1>
          {statusLine ? (
            <span className="status" role="status" aria-live="polite">
              <span className="dot" />
              {statusLine}
            </span>
          ) : null}
        </div>
        {submitted ? (
          <div className="confirm" role="status">
            <p className="confirm__title">{SUBMIT_IN_HEADING}</p>
            <p className="muted small">{SUBMIT_STILL_EDITABLE}</p>
          </div>
        ) : (
          <p className="muted small">
            Open until {closesPhrase}. A draft stays hidden from the capsule until you submit.
          </p>
        )}
        {restoredNote && !submitted ? (
          <p className="muted small" role="status">
            {SUBMIT_RESTORED_UNSAVED}
          </p>
        ) : null}
      </div>

      <label className="field">
        <span className="field__label">Letter</span>
        <textarea
          className="textarea"
          name="body"
          value={body}
          onChange={(event) => commitBody(event.target.value)}
          onBlur={() => {
            void persistLetterDraft();
          }}
          maxLength={20000}
          readOnly={busy}
          placeholder="What has this month been like?"
        />
        <span className="field__hint">No length rule. Three lines is a letter too.</span>
      </label>

      <div className="field">
        <span className="field__label">Photos</span>
        <div className="photos" style={{ marginTop: "0.5rem" }}>
          {photos.map((photo) => (
            <div className="photo" key={photo.id}>
              <img
                src={photo.preview}
                alt=""
                width={photo.width || undefined}
                height={photo.height || undefined}
              />
              <button
                className="photo__remove"
                type="button"
                aria-label="Remove photo"
                disabled={buttonBusy}
                onClick={() => {
                  setPhotos((current) => {
                    const next = current.filter((item) => item.id !== photo.id);
                    if (photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
                    return next;
                  });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <label className="photo photo--add" htmlFor="letter-photos">
              Add
            </label>
          ) : null}
        </div>
        <input
          id="letter-photos"
          ref={fileRef}
          type="file"
          accept={PHOTO_FILE_ACCEPT}
          multiple
          hidden
          disabled={buttonBusy}
          onChange={(event) => void onFiles(event.target.files)}
        />
        <p className="field__hint">
          {photos.length} of {MAX_PHOTOS} photos.
          {photos.length >= MAX_PHOTOS ? " Remove one to add another." : ""}
        </p>
      </div>

      {photoError ? (
        <p className="err" role="alert">
          {photoError}
        </p>
      ) : null}
      <MutationToast pending={busy} ok={state?.ok} message={toastMessage} />
      <div className="stack stack--tight">
        <PendingSubmitButton
          className="btn btn--primary btn--block btn--lg"
          name="intent"
          value="submit"
          busy={buttonBusy}
          disabled={preparingPhotos}
          pendingLabel={submitPendingLabel}
        >
          {preparingPhotos ? SUBMIT_PREPARING_PHOTOS : SUBMIT_AND_SEND}
        </PendingSubmitButton>
        {state?.error ? (
          <p className="err" role="alert">
            {state.error}
          </p>
        ) : null}
        <PendingSubmitButton
          className="btn btn--secondary btn--block"
          name="intent"
          value="draft"
          busy={buttonBusy}
          disabled={preparingPhotos}
          pendingLabel={draftPendingLabel}
        >
          {preparingPhotos ? SUBMIT_PREPARING_PHOTOS : SUBMIT_DRAFT}
        </PendingSubmitButton>
        <p className="btn-note" role="status">
          {preparingPhotos
            ? SUBMIT_PREPARING_PHOTOS
            : busy
              ? photos.some((photo) => photo.blob)
                ? "Working… uploading photos."
                : "Working…"
              : submitted
                ? SUBMIT_STILL_EDITABLE
                : "Save as draft to keep it hidden. After you submit, you can still edit until the window closes."}
        </p>
      </div>
    </form>
  );
}
