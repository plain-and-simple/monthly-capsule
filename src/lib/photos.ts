import "server-only";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase";

export function validatePhotoFile(file: File): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    return "Photos must be JPEG, PNG, or WebP.";
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return "Photo is too large.";
  }
  return null;
}

export function validatePhotoList(files: File[]): string | null {
  if (files.length > MAX_PHOTOS) {
    return `Max ${MAX_PHOTOS} photos.`;
  }
  for (const file of files) {
    const error = validatePhotoFile(file);
    if (error) return error;
  }
  return null;
}

export async function signedPhotoUrl(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function deleteStoredPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  await admin.storage.from(PHOTO_BUCKET).remove(paths);
}
