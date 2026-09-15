"use client";

import { useActionState, useRef, useState } from "react";
import { submitLetter, type SubmitState } from "@/actions/submit";
import { MutationToast } from "@/components/app-toast";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { MAX_PHOTOS } from "@/lib/constants";
import { SUBMIT_AND_SEND, SUBMIT_DRAFT, SUBMIT_SAVED_DRAFT, SUBMIT_SUBMITTED } from "@/lib/copy";
import { PHOTO_COMPRESS_FAILED, compressPhotoFile } from "@/lib/photo-compress";
import type { SubmitStatus } from "@/lib/submit";

type PreparedPhoto = {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  preview: string;
};

export function SubmitForm({
  groupId,
  closed,
  initialBody,
  existingPhotoCount,
  initialStatus,
  title,
  closesPhrase,
}: {
  groupId: string;
  closed: boolean;
  initialBody: string;
  existingPhotoCount: number;
  initialStatus: SubmitStatus | null;
  title: string;
  closesPhrase: string;
}) {
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLetter, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PHOTOS);
    setPhotoError(null);
    try {
      const next = await Promise.all(
        files.map(async (file) => {
          const photo = await compressPhotoFile(file);
          return { ...photo, preview: URL.createObjectURL(photo.blob) };
        }),
      );
      setPhotos((current) => {
        current.forEach((photo) => URL.revokeObjectURL(photo.preview));
        return next;
      });
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
          ? "Draft saved"
          : status === "submitted"
            ? "Submitted — still editable"
            : null;
  const toastMessage =
    state?.ok && status === "draft"
      ? SUBMIT_SAVED_DRAFT
      : state?.ok && status === "submitted"
        ? SUBMIT_SUBMITTED
        : null;

  if (closed) {
    return (
      <div className="stack">
        <h1>Your letter</h1>
        <p>Closed.</p>
      </div>
    );
  }

  return (
    <form
      className="stack stack--loose"
      aria-busy={busy || undefined}
      onSubmit={markBusy}
      action={async (formData) => {
        markBusy();
        formData.set("groupId", groupId);
        photos.forEach((photo) => {
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
          disabled={busy}
          placeholder="What has this month been like?"
        />
        <span className="field__hint">No length rule. Three lines is a letter too.</span>
      </label>

      <div className="field">
        <span className="field__label">Photos</span>
        <div className="photos" style={{ marginTop: "0.5rem" }}>
          {photos.map((photo) => (
            <div className="photo" key={photo.preview}>
              <img src={photo.preview} alt="" />
              <button
                className="photo__remove"
                type="button"
                aria-label="Remove photo"
                disabled={busy}
                onClick={() => {
                  setPhotos((current) => {
                    const next = current.filter((item) => item.preview !== photo.preview);
                    URL.revokeObjectURL(photo.preview);
                    return next;
                  });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <button
              className="photo photo--add"
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Add
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          disabled={busy}
          onChange={(event) => void onFiles(event.target.files)}
        />
        <p className="field__hint">
          Up to {MAX_PHOTOS}. New photos replace the last set
          {existingPhotoCount > 0 ? ` (${existingPhotoCount} saved)` : ""}.
        </p>
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
          pendingLabel={photos.length > 0 ? "Uploading…" : "Submitting…"}
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
            ? photos.length > 0
              ? "Working… uploading photos."
              : "Working…"
            : "Save as draft to keep it hidden. After you submit, you can still edit until the window closes."}
        </p>
      </div>
    </form>
  );
}
