import { describe, expect, it } from "vitest";
import { collectPhotoFiles, isPhotoUpload, photoContentType, validatePhotoList } from "./photo-files";

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
});
