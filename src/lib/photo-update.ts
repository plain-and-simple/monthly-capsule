import { MAX_PHOTOS } from "@/lib/constants";

export type ExistingPhotoRow = {
  id: string;
  storage_path: string;
  sort_order: number;
};

export type PhotoUpdatePlan = {
  keep: ExistingPhotoRow[];
  remove: ExistingPhotoRow[];
  nextSortStart: number;
  error: string | null;
};

/** Keep listed ids, drop the rest, append new files after kept ones. */
export function planPhotoUpdate(input: {
  existing: ExistingPhotoRow[];
  keepIds: readonly string[];
  newFileCount: number;
  maxPhotos?: number;
}): PhotoUpdatePlan {
  const max = input.maxPhotos ?? MAX_PHOTOS;
  const keepSet = new Set(input.keepIds);
  const keep = input.existing
    .filter((photo) => keepSet.has(photo.id))
    .sort((a, b) => a.sort_order - b.sort_order);
  const remove = input.existing.filter((photo) => !keepSet.has(photo.id));

  if (input.newFileCount < 0) {
    return { keep, remove, nextSortStart: keep.length, error: "Could not save photos." };
  }
  if (keep.length + input.newFileCount > max) {
    return {
      keep,
      remove,
      nextSortStart: keep.length,
      error: `Max ${max} photos.`,
    };
  }

  return {
    keep,
    remove,
    nextSortStart: keep.length,
    error: null,
  };
}

export function parseKeepPhotoIds(values: FormDataEntryValue[]): string[] {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}
