import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS } from "@/lib/constants";
import { PHOTOS_MAX } from "@/lib/copy";

/** File or Blob with bytes. Canvas / iOS FormData often yields Blob, not File. */
export type PhotoUpload = {
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function isPhotoUpload(value: unknown): value is PhotoUpload {
  if (typeof value !== "object" || value === null) return false;
  const blob = value as Partial<PhotoUpload>;
  return (
    typeof blob.size === "number" &&
    blob.size > 0 &&
    typeof blob.type === "string" &&
    typeof blob.arrayBuffer === "function"
  );
}

export function photoBatchFit(
  currentCount: number,
  incomingCount: number,
  max = MAX_PHOTOS,
): { keep: number; dropped: number } {
  const room = Math.max(0, max - currentCount);
  const keep = Math.min(Math.max(0, incomingCount), room);
  return { keep, dropped: Math.max(0, incomingCount - keep) };
}

export function takePhotosUpToMax<T>(
  current: readonly T[],
  incoming: readonly T[],
  max = MAX_PHOTOS,
): { next: T[]; kept: T[]; dropped: number } {
  const { keep, dropped } = photoBatchFit(current.length, incoming.length, max);
  const kept = incoming.slice(0, keep);
  return {
    next: [...current, ...kept],
    kept,
    dropped,
  };
}

export function appendPhotos<T>(current: readonly T[], incoming: readonly T[], max = MAX_PHOTOS): T[] {
  return takePhotosUpToMax(current, incoming, max).next;
}

export function collectPhotoFiles(formData: FormData): PhotoUpload[] {
  const files: PhotoUpload[] = [];
  for (const value of formData.getAll("photos")) {
    if (isPhotoUpload(value)) files.push(value);
  }
  return files;
}

export function photoContentType(file: PhotoUpload): (typeof ALLOWED_PHOTO_TYPES)[number] | null {
  if (ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    return file.type as (typeof ALLOWED_PHOTO_TYPES)[number];
  }
  // Empty type after a Blob round-trip; canvas output is JPEG.
  if (!file.type || file.type === "application/octet-stream") {
    return "image/jpeg";
  }
  return null;
}

export function validatePhotoFile(file: PhotoUpload): string | null {
  if (!photoContentType(file)) {
    return "Photos must be JPEG, PNG, or WebP.";
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return "Photo is too large.";
  }
  return null;
}

export function validatePhotoList(files: PhotoUpload[]): string | null {
  if (files.length > MAX_PHOTOS) {
    return PHOTOS_MAX;
  }
  for (const file of files) {
    const error = validatePhotoFile(file);
    if (error) return error;
  }
  return null;
}
