"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitLetter, type SubmitState } from "@/actions/submit";
import { MutationToast } from "@/components/app-toast";
import { PendingLink } from "@/components/pending-link";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { MAX_PHOTOS } from "@/lib/constants";
import {
  GROUP_PRIMARY_VIEW,
  SUBMIT_AND_SEND,
  SUBMIT_CLOSED_HEADING,
  SUBMIT_DRAFT,
  SUBMIT_EMPTY,
  SUBMIT_SAVED_DRAFT,
  SUBMIT_SUBMITTED,
} from "@/lib/copy";
import { appendPhotos } from "@/lib/photo-files";
import { PHOTO_COMPRESS_FAILED, compressPhotoFile } from "@/lib/photo-compress";
import { submissionHasContent, type SubmitStatus } from "@/lib/submit";

type StagedPhoto = {
  id: string;
  preview: string;
  savedPath?: string;
  blob?: Blob;
  name?: string;
  width?: number;
  height?: number;
};

export function SubmitForm({
  groupId,
  closed,
  initialBody,
  existingPhotos,
  initialStatus,
  title,
  closesPhrase,
  latestCapsuleHref,
}: {
  groupId: string;
  closed: boolean;
  initialBody: string;
  existingPhotos: Array<{ url: string; storagePath: string; width: number; height: number }>;
  initialStatus: SubmitStatus | null;
  title: string;
  closesPhrase: string;
  latestCapsuleHref?: string | null;
}) {
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
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLetter, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialSaved = existingPhotos.map((photo) => photo.storagePath).join("|");

  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    setPhotoError(null);
    try {
      const next = await Promise.all(
        files.map(async (file) => {
          const photo = await compressPhotoFile(file);
          return {
            id: `${photo.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            preview: URL.createObjectURL(photo.blob),
            blob: photo.blob,
            name: photo.name,
            width: photo.width,
            height: photo.height,
          } satisfies StagedPhoto;
        }),
      );
      setPhotos((current) => appendPhotos(current, next, MAX_PHOTOS));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : PHOTO_COMPRESS_FAILED);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const status = state?.status ?? initialStatus;
  const statusLine =
    state?.ok && status === "draft"
      ? SUBMIT_SAVED_DRAFT
      : state?.ok && status === "submitted"
        ? SUBMIT_SUBMITTED
        : status === "draft"
          ? SUBMIT_SAVED_DRAFT
          : status === "submitted"
            ? SUBMIT_SUBMITTED
            : null;
  const toastMessage =
    state?.ok && status === "draft"
      ? SUBMIT_SAVED_DRAFT
      : state?.ok && status === "submitted"
        ? SUBMIT_SUBMITTED
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
      aria-busy={busy || undefined}
      onSubmit={markBusy}
      action={async (formData) => {
        const intent = String(formData.get("intent") ?? "");
        const body = String(formData.get("body") ?? "");
        if (intent !== "draft" && !submissionHasContent(body, photos.length)) {
          setPhotoError(SUBMIT_EMPTY);
          return;
        }
        setPhotoError(null);
        markBusy();
        formData.set("groupId", groupId);
        if (photosTouched) formData.set("photos_touched", "1");
        keptPaths.forEach((path) => formData.append("keep_path", path));
        photos.forEach((photo) => {
          if (!photo.blob || !photo.name) return;
          const file = new File([photo.blob], photo.name, {
            type: photo.blob.type || "image/jpeg",
          });
          formData.append("photos", file);
        });
        return action(formData);
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <div className="stack stack--tight">
        <div className="row row--between">
          <h1>{title}</h1>
          {statusLine ? (
            <span className="status">
              <span className="dot" />
              {statusLine}
            </span>
          ) : null}
        </div>
        <p className="muted small">
          Open until {closesPhrase}. A draft stays hidden from the capsule until you submit.
        </p>
      </div>

      <label className="field">
        <span className="field__label">Letter</span>
        <textarea
          className="textarea"
          name="body"
          defaultValue={initialBody}
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
                width={photo.width}
                height={photo.height}
              />
              <button
                className="photo__remove"
                type="button"
                aria-label="Remove photo"
                disabled={busy}
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
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          disabled={busy}
          onChange={(event) => void onFiles(event.target.files)}
        />
        <p className="field__hint">Up to {MAX_PHOTOS}. Add more or remove any you do not want.</p>
      </div>

      {photoError ? <p className="err">{photoError}</p> : null}
      {state?.error ? <p className="err">{state.error}</p> : null}
      <MutationToast pending={busy} ok={state?.ok} message={toastMessage} />
      <div className="stack stack--tight">
        <PendingSubmitButton
          className="btn btn--primary btn--block btn--lg"
          name="intent"
          value="submit"
          busy={busy}
          pendingLabel={photos.some((photo) => photo.blob) ? "Uploading…" : "Submitting…"}
        >
          {SUBMIT_AND_SEND}
        </PendingSubmitButton>
        <PendingSubmitButton
          className="btn btn--secondary btn--block"
          name="intent"
          value="draft"
          busy={busy}
          pendingLabel="Saving…"
        >
          {SUBMIT_DRAFT}
        </PendingSubmitButton>
        <p className="btn-note" role="status">
          {busy
            ? photos.some((photo) => photo.blob)
              ? "Working… uploading photos."
              : "Working…"
            : "Save as draft to keep it hidden. After you submit, you can still edit until the window closes."}
        </p>
      </div>
    </form>
  );
}
