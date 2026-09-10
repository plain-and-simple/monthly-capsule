"use client";

import { useActionState, useRef, useState } from "react";
import { submitLetter, type SubmitState } from "@/actions/submit";
import { MAX_PHOTO_EDGE_PX, MAX_PHOTOS } from "@/lib/constants";
import { SUBMIT_AND_SEND, SUBMIT_DRAFT } from "@/lib/copy";
import type { SubmitStatus } from "@/lib/submit";

type PreparedPhoto = {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  preview: string;
};

async function resizeImage(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not resize");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Could not resize"))),
      "image/jpeg",
      0.85,
    );
  });
  return {
    blob,
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    width,
    height,
    preview: URL.createObjectURL(blob),
  };
}

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
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLetter, null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PHOTOS);
    const next = await Promise.all(files.map((file) => resizeImage(file)));
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.preview));
      return next;
    });
  }

  const status = state?.status ?? initialStatus;
  const statusLine =
    state?.ok && status === "draft"
      ? "Saved as draft"
      : state?.ok && status === "submitted"
        ? "Submitted"
        : status === "draft"
          ? "Draft saved"
          : status === "submitted"
            ? "Submitted — still editable"
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
      action={async (formData) => {
        formData.set("groupId", groupId);
        photos.forEach((photo) => {
          formData.append("photos", photo.blob, photo.name);
          formData.append("widths", String(photo.width));
          formData.append("heights", String(photo.height));
        });
        await action(formData);
      }}
    >
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
            <button className="photo photo--add" type="button" onClick={() => fileRef.current?.click()}>
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
          onChange={(event) => void onFiles(event.target.files)}
        />
        <p className="field__hint">
          Up to {MAX_PHOTOS}. New photos replace the last set
          {existingPhotoCount > 0 ? ` (${existingPhotoCount} saved)` : ""}.
        </p>
      </div>

      {state?.error ? <p className="err">{state.error}</p> : null}
      <div className="stack stack--tight">
        <button
          className="btn btn--primary btn--block btn--lg"
          type="submit"
          name="intent"
          value="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : SUBMIT_AND_SEND}
        </button>
        <button
          className="btn btn--secondary btn--block"
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
        >
          {SUBMIT_DRAFT}
        </button>
        <p className="btn-note">
          Save as draft to keep it hidden. After you submit, you can still edit until the window
          closes.
        </p>
      </div>
    </form>
  );
}
