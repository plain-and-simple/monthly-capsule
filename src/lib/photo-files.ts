import {
  ALLOWED_PHOTO_TYPES,
  HEIC_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_SOURCE_BYTES,
  MAX_PHOTOS,
} from "@/lib/constants";
import { PHOTOS_MAX, PHOTOS_TYPE } from "@/lib/copy";

/** File or Blob with bytes. Canvas / iOS FormData often yields Blob, not File. */
export type PhotoUpload = {
  size: number;
  type: string;
  name?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const HEIC_BRANDS = ["heic", "heix", "heif", "hevc", "hevx", "mif1", "msf1"] as const;

export function isHeicPhotoType(type: string): boolean {
  return (HEIC_PHOTO_TYPES as readonly string[]).includes(type.toLowerCase());
}

export function isHeicPhotoName(name: string | undefined): boolean {
  const lower = (name ?? "").toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

export function isHeicPhotoInput(file: { type?: string; name?: string }): boolean {
  return isHeicPhotoType(file.type ?? "") || isHeicPhotoName(file.name);
}

/** ISO-BMFF `ftyp` brand used by iPhone HEIC/HEIF. */
export function looksLikeHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return (HEIC_BRANDS as readonly string[]).includes(brand);
}

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

export function photoContentType(
  file: PhotoUpload,
): (typeof ALLOWED_PHOTO_TYPES)[number] | (typeof HEIC_PHOTO_TYPES)[number] | "image/heic" | null {
  if (ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    return file.type as (typeof ALLOWED_PHOTO_TYPES)[number];
  }
  if (isHeicPhotoType(file.type)) {
    return file.type.toLowerCase() as (typeof HEIC_PHOTO_TYPES)[number];
  }
  // Empty type after a Blob round-trip; canvas output is JPEG unless the name is HEIC.
  if (!file.type || file.type === "application/octet-stream") {
    return isHeicPhotoName(file.name) ? "image/heic" : "image/jpeg";
  }
  return null;
}

export function validatePhotoFile(file: PhotoUpload): string | null {
  if (!photoContentType(file)) {
    return PHOTOS_TYPE;
  }
  const maxBytes = isHeicPhotoInput(file) ? MAX_PHOTO_SOURCE_BYTES : MAX_PHOTO_BYTES;
  if (file.size <= 0 || file.size > maxBytes) {
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
