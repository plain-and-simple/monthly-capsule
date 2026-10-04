import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, MAX_PHOTO_SOURCE_BYTES, PHOTO_FILE_ACCEPT } from "./constants";
import { PHOTOS_MAX, PHOTOS_TYPE } from "./copy";
import {
  collectPhotoFiles,
  appendPhotos,
  isHeicPhotoInput,
  isPhotoUpload,
  looksLikeHeic,
  photoBatchFit,
  photoContentType,
  takePhotosUpToMax,
  validatePhotoFile,
  validatePhotoList,
} from "./photo-files";

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
    expect(validatePhotoList([blob])).toBe(PHOTOS_TYPE);
  });

  it("accepts iPhone HEIC/HEIF as input and does not treat it as too large at 1 MB", () => {
    const heic = new Blob([new Uint8Array(MAX_PHOTO_BYTES + 2048)], { type: "image/heic" });
    Object.defineProperty(heic, "name", { value: "IMG_1234.HEIC" });
    expect(isHeicPhotoInput({ type: "image/heic", name: "IMG_1234.HEIC" })).toBe(true);
    expect(isHeicPhotoInput({ type: "image/heif", name: "photo.heif" })).toBe(true);
    expect(photoContentType(heic)).toBe("image/heic");
    expect(validatePhotoFile(heic)).toBeNull();
    expect(validatePhotoList([heic])).toBeNull();
    expect(PHOTO_FILE_ACCEPT).toContain("image/heic");
    expect(PHOTO_FILE_ACCEPT).toContain(".heic");
    const huge = new Blob([new Uint8Array(MAX_PHOTO_SOURCE_BYTES + 1)], { type: "image/heic" });
    expect(validatePhotoFile(huge)).toBe("Photo is too large.");
  });

  it("recognizes an ISO-BMFF HEIC brand without trusting the MIME type", () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]);
    expect(looksLikeHeic(bytes)).toBe(true);
    expect(looksLikeHeic(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]))).toBe(
      false,
    );
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
