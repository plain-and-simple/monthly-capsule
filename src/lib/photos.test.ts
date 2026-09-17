import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES } from "./constants";
import { PHOTOS_MAX } from "./copy";
import { collectPhotoFiles, appendPhotos, isPhotoUpload, photoBatchFit, photoContentType, takePhotosUpToMax, validatePhotoList } from "./photo-files";

describe("submit photo uploads", () => {
  it("treats a Blob with size as a photo even when it is not a File", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    expect(isPhotoUpload(blob)).toBe(true);
    expect(isPhotoUpload("nope")).toBe(false);
    expect(isPhotoUpload(new Blob())).toBe(false);
  });

  it("collects Blob photos from FormData, not only File instances", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("photos", blob, "shot.jpg");
    const files = collectPhotoFiles(formData);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0]?.size).toBe(3);
  });

  it("accepts an empty MIME as JPEG after a Blob round-trip", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    expect(blob.type).toBe("");
    expect(photoContentType(blob)).toBe("image/jpeg");
    expect(validatePhotoList([blob])).toBeNull();
  });

  it("rejects a non-image type", () => {
    const blob = new Blob([new Uint8Array([1])], { type: "application/pdf" });
    expect(validatePhotoList([blob])).toBe("Photos must be JPEG, PNG, or WebP.");
  });

  it("rejects a photo over the 1 MB compressed cap", () => {
    const blob = new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type: "image/jpeg" });
    expect(validatePhotoList([blob])).toBe("Photo is too large.");
  });

  it("respects the max photo count", () => {
    const files = Array.from({ length: 7 }, () => new Blob([new Uint8Array([1])], { type: "image/jpeg" }));
    expect(validatePhotoList(files)).toBe(PHOTOS_MAX);
  });

  it("keeps the first 6 and reports extras that did not fit", () => {
    expect(appendPhotos([1, 2], [3, 4], 6)).toEqual([1, 2, 3, 4]);
    expect(appendPhotos([1, 2, 3, 4, 5], [6, 7], 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(takePhotosUpToMax([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], 6)).toEqual({
      next: [1, 2, 3, 4, 5, 6],
      kept: [6],
      dropped: 4,
    });
    expect(takePhotosUpToMax([1, 2, 3, 4, 5, 6], [7, 8], 6)).toEqual({
      next: [1, 2, 3, 4, 5, 6],
      kept: [],
      dropped: 2,
    });
    expect(photoBatchFit(0, 10, 6)).toEqual({ keep: 6, dropped: 4 });
    expect(photoBatchFit(5, 5, 6)).toEqual({ keep: 1, dropped: 4 });
    expect(photoBatchFit(6, 2, 6)).toEqual({ keep: 0, dropped: 2 });
  });
});
