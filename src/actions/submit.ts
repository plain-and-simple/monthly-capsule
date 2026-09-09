"use server";

import { revalidatePath } from "next/cache";
import { MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/constants";
import { ensureMonth } from "@/lib/compile";
import { deleteStoredPhotos, validatePhotoList } from "@/lib/photos";
import { currentYearMonth, isSubmitOpen } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type SubmitState = { error?: string; ok?: boolean } | null;

export async function submitLetter(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const groupId = String(formData.get("groupId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  const widths = formData.getAll("widths").map((value) => Number(value));
  const heights = formData.getAll("heights").map((value) => Number(value));

  if (body.length > 20_000) {
    return { error: "Letter is too long." };
  }

  const { member, group } = await requireGroupMember(groupId);
  if (!isSubmitOpen(group)) {
    return { error: "Submit is closed." };
  }

  const photoError = validatePhotoList(files);
  if (photoError) {
    return { error: photoError };
  }

  const yearMonth = currentYearMonth();
  const month = await ensureMonth(groupId, yearMonth, "open");
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("submissions")
    .select("*")
    .eq("month_id", month.id)
    .eq("member_id", member.id)
    .maybeSingle();

  const now = new Date().toISOString();
  let submissionId: string;

  if (existing) {
    const { error } = await admin
      .from("submissions")
      .update({ body, updated_at: now })
      .eq("id", existing.id);
    if (error) return { error: "Could not save." };
    submissionId = existing.id;
  } else {
    const { data: created, error } = await admin
      .from("submissions")
      .insert({
        month_id: month.id,
        member_id: member.id,
        body,
        submitted_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error || !created) return { error: "Could not save." };
    submissionId = created.id;
  }

  if (files.length > 0) {
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

    for (let i = 0; i < Math.min(files.length, MAX_PHOTOS); i += 1) {
      const file = files[i]!;
      const width = Number.isInteger(widths[i]) && widths[i]! > 0 ? widths[i]! : 1;
      const height = Number.isInteger(heights[i]) && heights[i]! > 0 ? heights[i]! : 1;
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const storagePath = `${groupId}/${month.id}/${submissionId}/${i}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await admin.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: true,
        });
      if (uploadError) {
        return { error: "Could not store photo." };
      }

      rows.push({
        submission_id: submissionId,
        storage_path: storagePath,
        width,
        height,
        bytes: file.size,
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
  return { ok: true };
}
