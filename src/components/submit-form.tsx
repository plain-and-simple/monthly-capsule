"use client";

import { useActionState, useState } from "react";
import { submitLetter, type SubmitState } from "@/actions/submit";
import { MAX_PHOTO_EDGE_PX, MAX_PHOTOS } from "@/lib/constants";

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
}: {
  groupId: string;
  closed: boolean;
  initialBody: string;
  existingPhotoCount: number;
}) {
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLetter, null);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PHOTOS);
    const next = await Promise.all(files.map((file) => resizeImage(file)));
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.preview));
      return next;
    });
  }

  if (closed) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-4xl leading-tight">Submit</h1>
        <p>Closed.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
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
      <h1 className="font-serif text-4xl leading-tight">Submit</h1>
      <div className="field">
        <label htmlFor="body">Letter</label>
        <textarea
          id="body"
          name="body"
          defaultValue={initialBody}
          maxLength={20000}
          className="font-serif text-lg leading-relaxed"
        />
      </div>
      <div className="field">
        <label htmlFor="photos">Photos</label>
        <input
          id="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => void onFiles(event.target.files)}
        />
        <p className="text-sm text-muted">
          Up to {MAX_PHOTOS}. New photos replace the last set
          {existingPhotoCount > 0 ? ` (${existingPhotoCount} saved)` : ""}.
        </p>
      </div>
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <img
              key={photo.preview}
              src={photo.preview}
              alt=""
              className="h-24 w-full rounded-md object-cover"
            />
          ))}
        </div>
      ) : null}
      {state?.error ? <p className="err">{state.error}</p> : null}
      {state?.ok ? <p>Saved.</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
