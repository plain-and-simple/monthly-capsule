import "server-only";
import type { CapsuleArchive } from "@/lib/capsule-archive";
import {
  buildCapsulePdfBytes,
  capsulePdfFilename,
  capsulePdfNeedsUnicodeRerender,
  capsulePdfStoragePath,
  createPdfBuildTiming,
  logPdfServerTiming,
  PDF_CONTENT_TYPE,
  type CapsulePdfPhotoBytes,
} from "@/lib/capsule-pdf";
import { selectEnsuredCapsulePdf } from "@/lib/capsule-pdf-fonts";
import { codedError, opsFailureCode } from "@/lib/compile-policy";
import { PHOTO_BUCKET } from "@/lib/constants";
import { reportOpsAlert } from "@/lib/ops-alert-mail";
import { createAdminClient } from "@/lib/supabase";
import { withTimeout } from "@/lib/with-timeout";

/** One storage read. Six photos stay inside the compile function budget. */
export const STORAGE_DOWNLOAD_TIMEOUT_MS = 8_000;
const STORAGE_DOWNLOAD_TIMEOUT = "storage_download_timeout";

async function readStorageObject(storagePath: string): Promise<Uint8Array | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function downloadStorageBytes(storagePath: string): Promise<Uint8Array | null> {
  try {
    return await withTimeout(readStorageObject(storagePath), STORAGE_DOWNLOAD_TIMEOUT_MS, STORAGE_DOWNLOAD_TIMEOUT);
  } catch (error) {
    if (error instanceof Error && error.message === STORAGE_DOWNLOAD_TIMEOUT) {
      console.error("storage download timed out");
    }
    return null;
  }
}

export async function loadArchivePhotoBytes(
  archive: CapsuleArchive,
): Promise<CapsulePdfPhotoBytes[]> {
  const paths = [
    ...new Set(archive.letters.flatMap((letter) => letter.photos.map((photo) => photo.storage_path))),
  ];
  const rows = await Promise.all(
    paths.map(async (storage_path) => ({
      storage_path,
      bytes: await downloadStorageBytes(storage_path),
    })),
  );
  if (rows.some((row) => !row.bytes)) throw codedError("pdf_photos_missing");
  return rows.map((row) => ({ storage_path: row.storage_path, bytes: row.bytes! }));
}

export async function uploadCapsulePdf(storagePath: string, bytes: Uint8Array): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(PHOTO_BUCKET).upload(storagePath, bytes, {
    contentType: PDF_CONTENT_TYPE,
    upsert: true,
  });
  return !error;
}

/** Overwrite the stored PDF for this edition. Never mints a new month / ·vN row. */
export async function generateAndStoreCapsulePdf(input: {
  capsuleId: string;
  groupId: string;
  groupName: string;
  yearMonth: string;
  version: number;
  archive: CapsuleArchive;
}): Promise<{ storagePath: string; bytes: Uint8Array; filename: string }> {
  const timing = createPdfBuildTiming();
  try {
    const photos = await loadArchivePhotoBytes(input.archive);
    const bytes = await buildCapsulePdfBytes({ archive: input.archive, photos, timing });
    const storagePath = capsulePdfStoragePath(input.groupId, input.yearMonth, input.version);
    const uploadStart = performance.now();
    const uploaded = await uploadCapsulePdf(storagePath, bytes);
    timing.uploadMs = performance.now() - uploadStart;
    if (!uploaded) throw codedError("pdf_upload_failed");

    const admin = createAdminClient();
    const { error } = await admin
      .from("capsules")
      .update({ pdf_storage_path: storagePath })
      .eq("id", input.capsuleId);
    if (error) throw codedError("pdf_path_failed");

    return {
      storagePath,
      bytes,
      filename: capsulePdfFilename(input.groupName, input.yearMonth, input.version),
    };
  } finally {
    logPdfServerTiming(timing);
  }
}

export async function loadStoredCapsulePdf(input: {
  groupName: string;
  yearMonth: string;
  version: number;
  pdfStoragePath?: string | null;
}): Promise<{ storagePath: string; bytes: Uint8Array; filename: string } | null> {
  if (!input.pdfStoragePath) return null;
  const existing = await downloadStorageBytes(input.pdfStoragePath);
  if (!existing) return null;
  return {
    storagePath: input.pdfStoragePath,
    bytes: existing,
    filename: capsulePdfFilename(input.groupName, input.yearMonth, input.version),
  };
}

/**
 * Rebuilds a stale stored PDF in place (same version, same archive/theme).
 * Does not create a new edition or change letter bodies.
 */
export async function ensureCapsulePdf(input: {
  capsuleId: string;
  groupId: string;
  groupName: string;
  yearMonth: string;
  version: number;
  archive: CapsuleArchive;
  pdfStoragePath?: string | null;
}): Promise<{ storagePath: string; bytes: Uint8Array; filename: string } | null> {
  const stored = await loadStoredCapsulePdf(input);
  if (stored && !capsulePdfNeedsUnicodeRerender(stored.bytes)) return stored;
  try {
    return selectEnsuredCapsulePdf(stored, await generateAndStoreCapsulePdf(input));
  } catch (error) {
    const code = opsFailureCode(error);
    console.error("capsule pdf generate failed", code);
    await reportOpsAlert({
      route: "ensureCapsulePdf",
      code,
      groupId: input.groupId,
      memberId: null,
    });
    return stored;
  }
}
