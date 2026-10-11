"use server";

import { revalidatePath } from "next/cache";
import { membershipIsActive, submitBlockedReason } from "@/lib/account";
import { MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/constants";
import { ensureMonth } from "@/lib/compile";
import { storedPhotoExtension } from "@/lib/photo-compress";
import { collectPhotoFiles, validatePhotoList } from "@/lib/photo-files";
import { compressPhotoForStorage } from "@/lib/photo-ingest";
import { deleteStoredPhotos } from "@/lib/photos";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { findAccountById } from "@/lib/memberships";
import { requireGroupMember } from "@/lib/session";
import { SUBMIT_EMPTY, PHOTOS_MAX } from "@/lib/copy";
import {
  isUniqueConstraintError,
  logSubmitPhotoFailure,
  newPhotoStorageNonce,
  nextAutosaveWrite,
  parseSubmitIntent,
  runSubmitPhotoCommit,
  submissionHasContent,
  type SubmitStatus,
} from "@/lib/submit";
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
      return { error: PHOTOS_MAX };
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
    const filesToStore = files.slice(0, MAX_PHOTOS - keepPaths.length);

    const result = await runSubmitPhotoCommit({
      existing: existing
        ? {
            id: existing.id as string,
            status: (existing.status as string | null) ?? null,
            body: String(existing.body ?? ""),
          }
        : null,
      body,
      intent,
      fileCount: filesToStore.length,
      keepPaths,
      photosTouched,
      now,
      groupId,
      monthId: month.id,
      readFileBytes: async (index) => Buffer.from(await filesToStore[index]!.arrayBuffer()),
      deps: {
        compressFile: async (_index, bytes) => compressPhotoForStorage(Buffer.from(bytes)),
        uploadPhoto: async (path, photo) => {
          const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, photo.buffer, {
            contentType: photo.contentType,
            upsert: false,
          });
          return { error };
        },
        loadPhotos: async (submissionId) => {
          const { data } = await admin
            .from("photos")
            .select("id, storage_path")
            .eq("submission_id", submissionId);
          return (data ?? []).map((row) => ({
            id: row.id as string,
            storage_path: row.storage_path as string,
          }));
        },
        insertPhotoRows: async (rows) => {
          const { error } = await admin.from("photos").insert(rows);
          return { error };
        },
        writeSubmission: async ({ existingId, patch }) => {
          if (existingId) {
            const { error } = await admin.from("submissions").update(patch).eq("id", existingId);
            if (error) return { error: "Could not save." };
            return { id: existingId };
          }
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
          return { id: created.id as string };
        },
        deleteDroppedPhotos: async (dropped) => {
          await deleteStoredPhotos(dropped.map((photo) => photo.storage_path));
          if (dropped.length > 0) {
            await admin
              .from("photos")
              .delete()
              .in(
                "id",
                dropped.map((photo) => photo.id),
              );
          }
        },
        cleanupUploads: async (paths) => {
          await deleteStoredPhotos(paths);
        },
        rollbackNewPhotos: async (paths) => {
          if (paths.length === 0) return;
          await admin.from("photos").delete().in("storage_path", paths);
          await deleteStoredPhotos(paths);
        },
        makeNonce: newPhotoStorageNonce,
        photoExt: storedPhotoExtension,
        logPhotoFailure: ({ photoIndex, stage, error }) => {
          logSubmitPhotoFailure({ groupId, photoIndex, stage, error });
        },
      },
    });

    if ("error" in result) return { error: result.error };

    revalidatePath(`/g/${groupId}`);
    revalidatePath(`/g/${groupId}/submit`);
    return { ok: true, status: result.status };
  } catch (error) {
    // redirect() / notFound() use a digest; rethrow those. ensureMonth and
    // photo/storage failures must not become the Next.js digest 500 page.
    if (isRedirectError(error)) throw error;
    console.error("submitLetter failed", error);
    return { error: "Could not save." };
  }
}

/** Letter text only. Never reads photos, keep_path, or photos_touched. */
export async function saveLetterDraft(groupId: string, body: string): Promise<SubmitState> {
  try {
    const letter = String(body ?? "").trim();
    if (letter.length > 20_000) {
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

    const month = await ensureMonth(groupId, window.yearMonth, "open", window.version);
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("submissions")
      .select("id, status")
      .eq("month_id", month.id)
      .eq("member_id", member.id)
      .maybeSingle();

    const write = nextAutosaveWrite({
      existing: existing ? { status: (existing.status as string | null) ?? null } : null,
      body: letter,
      now: new Date().toISOString(),
    });
    if (write.skip) {
      return { ok: true, status: write.status };
    }

    if (existing) {
      const { data: updated, error } = await admin
        .from("submissions")
        .update(write.patch)
        .eq("id", existing.id)
        .neq("status", "submitted")
        .select("id")
        .maybeSingle();
      if (error) return { error: "Could not save." };
      if (!updated) {
        return { ok: true, status: "submitted" };
      }
    } else {
      const { error } = await admin.from("submissions").insert({
        month_id: month.id,
        member_id: member.id,
        ...write.patch,
      });
      if (error) {
        if (isUniqueConstraintError(error)) {
          return { ok: true, status: "submitted" };
        }
        return { error: "Could not save." };
      }
    }

    revalidatePath(`/g/${groupId}`);
    revalidatePath(`/g/${groupId}/submit`);
    return { ok: true, status: "draft" };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("saveLetterDraft failed", error);
    return { error: "Could not save." };
  }
}
