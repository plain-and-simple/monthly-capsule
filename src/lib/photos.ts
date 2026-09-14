import "server-only";
import { PHOTO_BUCKET } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase";

export {
  collectPhotoFiles,
  isPhotoUpload,
  photoContentType,
  validatePhotoFile,
  validatePhotoList,
} from "@/lib/photo-files";

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
