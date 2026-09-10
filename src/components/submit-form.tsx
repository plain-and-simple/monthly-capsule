"use client";

import Link from "next/link";
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

export type ExistingPhotoPreview = {
  id: string;
  url: string;
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

function statusLabel(status: SubmitStatus | null): string | null {
  if (status === "draft") return "Draft — not in the capsule";
  if (status === "submitted") return "Submitted";
  return null;
}

export function SubmitForm({
  groupId,
  closed,
  initialBody,
  existingPhotos,
  initialStatus,
  title,
  closesPhrase,
  nextOpenPhrase,
  capsuleHref,
  groupHref,
}: {
  groupId: string;
  closed: boolean;
  initialBody: string;
  existingPhotos: ExistingPhotoPreview[];
  initialStatus: SubmitStatus | null;
  title: string;
  closesPhrase: string;
  nextOpenPhrase: string;
  capsuleHref: string | null;
  groupHref: string;
}) {
  const [keptExisting, setKeptExisting] = useState<ExistingPhotoPreview[]>(existingPhotos);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [photosTouched, setPhotosTouched] = useState(false);
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLetter, null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(list: FileList | null) {
    const room = MAX_PHOTOS - keptExisting.length - photos.length;
    if (room <= 0) return;
    const files = Array.from(list ?? []).slice(0, room);
    const next = await Promise.all(files.map((file) => resizeImage(file)));
    setPhotosTouched(true);
    setPhotos((current) => [...current, ...next]);
    if (fileRef.current) fileRef.current.value = "";
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
    const closedStatus = statusLabel(initialStatus);
    return (
      <div className="stack stack--loose">
        <div className="stack stack--tight">
          <h1>{title}</h1>
          <p className="muted small">
            Writing is closed. It opens again on {nextOpenPhrase}.
          </p>
          {closedStatus ? (
            <span className="status">
              <span className="dot" />
              {closedStatus}
            </span>
          ) : (
            <p className="muted small">You did not save a letter this time.</p>
          )}
        </div>

        {initialBody ? (
          <div className="panel">
            <p className="field__label">Your letter</p>
            <div className="letter__body" style={{ whiteSpace: "pre-wrap" }}>
              {initialBody}
            </div>
          </div>
        ) : null}

        {existingPhotos.length > 0 ? (
          <div className="field">
            <span className="field__label">Photos</span>
            <div className="photos" style={{ marginTop: "0.5rem" }}>
              {existingPhotos.map((photo) => (
                <div className="photo" key={photo.id}>
                  <img src={photo.url} alt="" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="stack stack--tight">
          {capsuleHref ? (
            <Link className="btn btn--primary btn--block" href={capsuleHref}>
              Read the capsule
            </Link>
          ) : null}
          <Link className="btn btn--secondary btn--block" href={groupHref}>
            Back to the group
          </Link>
        </div>
      </div>
    );
  }

  const totalPhotos = keptExisting.length + photos.length;

  return (
    <form
      className="stack stack--loose"
      action={async (formData) => {
        formData.set("groupId", groupId);
        if (photosTouched) {
          formData.set("photosTouched", "1");
          keptExisting.forEach((photo) => formData.append("keepPhotoIds", photo.id));
        }
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
          {keptExisting.map((photo) => (
            <div className="photo" key={photo.id}>
              <img src={photo.url} alt="" />
              <button
                className="photo__remove"
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  setPhotosTouched(true);
                  setKeptExisting((current) => current.filter((item) => item.id !== photo.id));
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.map((photo) => (
            <div className="photo" key={photo.preview}>
              <img src={photo.preview} alt="" />
              <button
                className="photo__remove"
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  setPhotosTouched(true);
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
          {totalPhotos < MAX_PHOTOS ? (
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
          Up to {MAX_PHOTOS}. New photos add to the set; remove any you do not want to keep.
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
