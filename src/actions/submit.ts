"use server";

import { revalidatePath } from "next/cache";
import { submitBlockedReason } from "@/lib/account";
import { MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/constants";
import { ensureMonth } from "@/lib/compile";
import { PhotoCompressError, storedPhotoExtension } from "@/lib/photo-compress";
import { collectPhotoFiles, validatePhotoList } from "@/lib/photo-files";
import { compressPhotoForStorage } from "@/lib/photo-ingest";
import { deleteStoredPhotos } from "@/lib/photos";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { requireGroupMember } from "@/lib/session";
import { nextSubmissionWrite, parseSubmitIntent, type SubmitStatus } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";

export type SubmitState = {
  error?: string;
  ok?: boolean;
  status?: SubmitStatus;
} | null;

function isRedirectError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error);
}

export async function submitLetter(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  try {
    const groupId = String(formData.get("groupId") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    const intent = parseSubmitIntent(formData.get("intent"));
    const files = collectPhotoFiles(formData);

    if (body.length > 20_000) {
      return { error: "Letter is too long." };
    }

    const { member, group } = await requireGroupMember(groupId);
    const blocked = submitBlockedReason(member);
    if (blocked) {
      return { error: blocked };
    }
    const window = await resolveSubmitWindow(group);
    if (!window.open || !window.yearMonth || window.version == null) {
      return { error: "Submit is closed." };
    }

    const photoError = validatePhotoList(files);
    if (photoError) {
      return { error: photoError };
    }

    const yearMonth = window.yearMonth;
    const month = await ensureMonth(groupId, yearMonth, "open", window.version);
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("submissions")
      .select("*")
      .eq("month_id", month.id)
      .eq("member_id", member.id)
      .maybeSingle();

    const now = new Date().toISOString();
    const patch = nextSubmissionWrite({
      existing: existing ? { status: (existing.status as string | null) ?? null } : null,
      body,
      intent,
      now,
    });
    let submissionId: string;

    if (existing) {
      const { error } = await admin.from("submissions").update(patch).eq("id", existing.id);
      if (error) return { error: "Could not save." };
      submissionId = existing.id;
    } else {
      const { data: created, error } = await admin
        .from("submissions")
        .insert({
          month_id: month.id,
          member_id: member.id,
          ...patch,
        })
        .select("id")
        .single();
      if (error || !created) return { error: "Could not save." };
      submissionId = created.id;
    }

    if (files.length > 0) {
      const compressed = [];
      for (const file of files.slice(0, MAX_PHOTOS)) {
        try {
          compressed.push(await compressPhotoForStorage(Buffer.from(await file.arrayBuffer())));
        } catch (error) {
          const message =
            error instanceof PhotoCompressError ? error.message : "Could not compress that photo. Try another.";
          return { error: message };
        }
      }

      const { data: oldPhotos } = await admin
        .from("photos")
        .select("id, storage_path")
        .eq("submission_id", submissionId);

      const oldPaths = (oldPhotos ?? []).map((photo) => photo.storage_path as string);
      await deleteStoredPhotos(oldPaths);
      if (oldPhotos && oldPhotos.length > 0) {
        await admin.from("photos").delete().eq("submission_id", submissionId);
      }

      const rows: {
        submission_id: string;
        storage_path: string;
        width: number;
        height: number;
        bytes: number;
        sort_order: number;
      }[] = [];

      for (let i = 0; i < compressed.length; i += 1) {
        const photo = compressed[i]!;
        const ext = storedPhotoExtension(photo.contentType);
        const storagePath = `${groupId}/${month.id}/${submissionId}/${i}.${ext}`;

        const { error: uploadError } = await admin.storage.from(PHOTO_BUCKET).upload(storagePath, photo.buffer, {
          contentType: photo.contentType,
          upsert: true,
        });
        if (uploadError) {
          return { error: "Could not store photo." };
        }

        rows.push({
          submission_id: submissionId,
          storage_path: storagePath,
          width: photo.width,
          height: photo.height,
          bytes: photo.bytes,
          sort_order: i,
        });
      }

      const { error: photoInsertError } = await admin.from("photos").insert(rows);
      if (photoInsertError) {
        return { error: "Could not save photos." };
      }
    }

    revalidatePath(`/g/${groupId}`);
    revalidatePath(`/g/${groupId}/submit`);
    return { ok: true, status: intent };
  } catch (error) {
    // redirect() / notFound() use a digest; rethrow those. ensureMonth and
    // photo/storage failures must not become the Next.js digest 500 page.
    if (isRedirectError(error)) throw error;
    console.error("submitLetter failed", error);
    return { error: "Could not save." };
  }
}
