import "server-only";
import { PHOTO_BUCKET } from "@/lib/constants";
import {
  buildCapsulePdfBytes,
  capsulePdfFilename,
  capsulePdfStoragePath,
  PDF_CONTENT_TYPE,
  type CapsulePdfPhotoBytes,
} from "@/lib/capsule-pdf";
import type { CapsuleArchive } from "@/lib/capsule-archive";
import { createAdminClient } from "@/lib/supabase";

export async function downloadStorageBytes(storagePath: string): Promise<Uint8Array | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function loadArchivePhotoBytes(
  archive: CapsuleArchive,
): Promise<CapsulePdfPhotoBytes[]> {
  const paths = [
    ...new Set(
      archive.letters.flatMap((letter) => letter.photos.map((photo) => photo.storage_path)),
    ),
  ];
  const photos: CapsulePdfPhotoBytes[] = [];
  for (const storage_path of paths) {
    const bytes = await downloadStorageBytes(storage_path);
    if (bytes) photos.push({ storage_path, bytes });
  }
  return photos;
}

export async function uploadCapsulePdf(
  storagePath: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(PHOTO_BUCKET).upload(storagePath, bytes, {
    contentType: PDF_CONTENT_TYPE,
    upsert: true,
  });
  return !error;
}

export async function generateAndStoreCapsulePdf(input: {
  capsuleId: string;
  groupId: string;
  groupName: string;
  yearMonth: string;
  version: number;
  archive: CapsuleArchive;
}): Promise<{ storagePath: string; bytes: Uint8Array; filename: string } | null> {
  const photos = await loadArchivePhotoBytes(input.archive);
  const bytes = await buildCapsulePdfBytes({ archive: input.archive, photos });
  const storagePath = capsulePdfStoragePath(input.groupId, input.yearMonth, input.version);
  const uploaded = await uploadCapsulePdf(storagePath, bytes);
  if (!uploaded) return null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("capsules")
    .update({ pdf_storage_path: storagePath })
    .eq("id", input.capsuleId);
  if (error) return null;

  return {
    storagePath,
    bytes,
    filename: capsulePdfFilename(input.groupName, input.yearMonth, input.version),
  };
}

export async function ensureCapsulePdf(input: {
  capsuleId: string;
  groupId: string;
  groupName: string;
  yearMonth: string;
  version: number;
  archive: CapsuleArchive;
  pdfStoragePath?: string | null;
}): Promise<{ storagePath: string; bytes: Uint8Array; filename: string } | null> {
  const filename = capsulePdfFilename(input.groupName, input.yearMonth, input.version);
  if (input.pdfStoragePath) {
    const existing = await downloadStorageBytes(input.pdfStoragePath);
    if (existing) {
      return { storagePath: input.pdfStoragePath, bytes: existing, filename };
    }
  }
  return generateAndStoreCapsulePdf(input);
}
