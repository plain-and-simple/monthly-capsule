import "server-only";
import { PHOTO_BUCKET } from "@/lib/constants";
import { mapSignedUrlRows } from "@/lib/photo-urls";
import { createAdminClient } from "@/lib/supabase";

export {
  collectPhotoFiles,
  isPhotoUpload,
  photoContentType,
  validatePhotoFile,
  validatePhotoList,
} from "@/lib/photo-files";

export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 60 * 60);
  if (error) return mapSignedUrlRows(unique, []);
  return mapSignedUrlRows(unique, data);
}

export async function signedPhotoUrl(storagePath: string): Promise<string | null> {
  const urls = await signedPhotoUrls([storagePath]);
  return urls.get(storagePath) ?? null;
}

export async function deleteStoredPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  await admin.storage.from(PHOTO_BUCKET).remove(paths);
}
