"use server";

import { revalidatePath } from "next/cache";
import { membershipIsActive, submitBlockedReason } from "@/lib/account";
import { MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/constants";
import { ensureMonth } from "@/lib/compile";
import { PhotoCompressError, storedPhotoExtension } from "@/lib/photo-compress";
import { collectPhotoFiles, validatePhotoList } from "@/lib/photo-files";
import { compressPhotoForStorage } from "@/lib/photo-ingest";
import { deleteStoredPhotos } from "@/lib/photos";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { findAccountById } from "@/lib/memberships";
import { requireGroupMember } from "@/lib/session";
import { SUBMIT_EMPTY } from "@/lib/copy";
import { nextSubmissionWrite, parseSubmitIntent, submissionHasContent, type SubmitStatus } from "@/lib/submit";
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
    if (!membershipIsActive(member)) {
      return { error: "Could not save." };
    }
    const linkedAccount = member.account_id ? await findAccountById(member.account_id) : null;
    const blocked = submitBlockedReason(member, linkedAccount);
    if (blocked) {
      return { error: blocked };
    }
    const window = await resolveSubmitWindow(group);
    if (!window.open || !window.yearMonth || window.version == null) {
      return { error: "Submit is closed." };
    }

    const keepPaths = formData
      .getAll("keep_path")
      .map((value) => String(value))
      .filter(Boolean);
    const photosTouched = String(formData.get("photos_touched") ?? "") === "1";
    if (keepPaths.length + files.length > MAX_PHOTOS) {
      return { error: `Max ${MAX_PHOTOS} photos.` };
    }

    const photoError = validatePhotoList(files);
    if (photoError) {
      return { error: photoError };
    }

    const photoCount = keepPaths.length + files.length;
    if (intent === "submitted" && !submissionHasContent(body, photoCount)) {
      return { error: SUBMIT_EMPTY };
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

    if (files.length > 0 || photosTouched) {
      const compressed = [];
      for (const file of files.slice(0, MAX_PHOTOS - keepPaths.length)) {
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

      const kept = (oldPhotos ?? []).filter((photo) => keepPaths.includes(photo.storage_path as string));
      const dropped = (oldPhotos ?? []).filter((photo) => !keepPaths.includes(photo.storage_path as string));
      await deleteStoredPhotos(dropped.map((photo) => photo.storage_path as string));
      if (dropped.length > 0) {
        await admin
          .from("photos")
          .delete()
          .in(
            "id",
            dropped.map((photo) => photo.id as string),
          );
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
        const sortOrder = kept.length + i;
        const storagePath = `${groupId}/${month.id}/${submissionId}/${sortOrder}.${ext}`;

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
          sort_order: sortOrder,
        });
      }

      if (rows.length > 0) {
        const { error: photoInsertError } = await admin.from("photos").insert(rows);
        if (photoInsertError) {
          return { error: "Could not save photos." };
        }
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
