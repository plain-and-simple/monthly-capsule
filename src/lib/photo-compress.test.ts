import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_EDGE_PX,
  MAX_PHOTOS,
  PHOTO_ENCODE_QUALITY,
  PHOTO_POST_BUDGET_BYTES,
} from "./constants";
import {
  PHOTO_COMPRESS_FAILED,
  PHOTO_TOO_LARGE,
  PhotoCompressError,
  choosePhotoEncodeType,
  encodePhotoToBudget,
  isWithinPhotoBudget,
  photoOutputName,
  photoQualityLadder,
  scalePhotoDimensions,
  sharpQuality,
  storedPhotoExtension,
} from "./photo-compress";

describe("photo compress helpers", () => {
  it("scales the long edge to 1600 and leaves smaller images alone", () => {
    expect(scalePhotoDimensions(3200, 1800)).toEqual({ width: 1600, height: 900 });
    expect(scalePhotoDimensions(1800, 3200)).toEqual({ width: 900, height: 1600 });
    expect(scalePhotoDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(MAX_PHOTO_EDGE_PX).toBe(1600);
  });

  it("uses quality 0.8 then retries down toward 0.5", () => {
    expect(PHOTO_ENCODE_QUALITY).toBe(0.8);
    expect(photoQualityLadder()).toEqual([0.8, 0.7, 0.6, 0.5]);
    expect(sharpQuality(0.8)).toBe(80);
  });

  it("prefers WebP and falls back to JPEG", () => {
    expect(choosePhotoEncodeType(true)).toBe("image/webp");
    expect(choosePhotoEncodeType(false)).toBe("image/jpeg");
    expect(storedPhotoExtension("image/webp")).toBe("webp");
    expect(storedPhotoExtension("image/jpeg")).toBe("jpg");
    expect(photoOutputName("IMG_1234.HEIC", "image/webp")).toBe("IMG_1234.webp");
    expect(photoOutputName("shot.png", "image/jpeg")).toBe("shot.jpg");
  });

  it("caps a photo at 1 MB and keeps the action post under 16 MB", () => {
    expect(MAX_PHOTO_BYTES).toBe(1_048_576);
    expect(isWithinPhotoBudget(MAX_PHOTO_BYTES)).toBe(true);
    expect(isWithinPhotoBudget(MAX_PHOTO_BYTES + 1)).toBe(false);
    expect(isWithinPhotoBudget(0)).toBe(false);
    expect(MAX_PHOTOS).toBe(6);
    expect(PHOTO_POST_BUDGET_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it("retries lower quality when the first encode is over budget", async () => {
    const sizes = [MAX_PHOTO_BYTES + 20_000, MAX_PHOTO_BYTES + 5_000, 400_000];
    let i = 0;
    const result = await encodePhotoToBudget({
      preferWebP: true,
      toBlob: async (type) => {
        const size = sizes[Math.min(i, sizes.length - 1)]!;
        i += 1;
        return new Blob([new Uint8Array(size)], { type });
      },
    });
    expect(result.type).toBe("image/webp");
    expect(result.blob.size).toBe(400_000);
    expect(i).toBeGreaterThan(1);
  });

  it("falls back to JPEG when WebP encode returns null (older Safari)", async () => {
    const result = await encodePhotoToBudget({
      preferWebP: true,
      toBlob: async (type) => {
        if (type === "image/webp") return null;
        return new Blob([new Uint8Array(1200)], { type: "image/jpeg" });
      },
    });
    expect(result.type).toBe("image/jpeg");
    expect(result.blob.size).toBe(1200);
  });

  it("rejects when every retry is still over budget", async () => {
    await expect(
      encodePhotoToBudget({
        preferWebP: false,
        toBlob: async (type) => new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type }),
      }),
    ).rejects.toBeInstanceOf(PhotoCompressError);
    await expect(
      encodePhotoToBudget({
        preferWebP: false,
        toBlob: async (type) => new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type }),
      }),
    ).rejects.toThrow(PHOTO_TOO_LARGE);
  });

  it("rejects when the encoder cannot produce a blob", async () => {
    await expect(
      encodePhotoToBudget({
        preferWebP: true,
        toBlob: async () => null,
      }),
    ).rejects.toThrow(PHOTO_COMPRESS_FAILED);
  });
});
