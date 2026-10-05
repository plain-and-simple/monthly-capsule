import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, MAX_PHOTO_EDGE_PX } from "./constants";
import { PHOTO_COMPRESS_FAILED, PHOTO_TOO_LARGE } from "./photo-compress";
import { compressPhotoForStorage, decodeHeicToJpeg, ensureReadablePhotoBuffer } from "./photo-ingest";
import { looksLikeHeic } from "./photo-files";

const here = dirname(fileURLToPath(import.meta.url));
const sampleHeic = readFileSync(resolve(here, "fixtures/sample.heic"));

async function makeNoisySource(width: number, height: number, exifText?: string) {
  const sharp = (await import("sharp")).default;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = (i * 13 + 47) % 256;
  }
  let pipeline = sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 });
  if (exifText) {
    pipeline = sharp(await pipeline.toBuffer())
      .withMetadata({
        exif: {
          IFD0: { ImageDescription: exifText },
        },
      })
      .jpeg({ quality: 95 });
  }
  return pipeline.toBuffer();
}

async function makeSource(options?: { width?: number; height?: number; exifText?: string }) {
  const sharp = (await import("sharp")).default;
  const width = options?.width ?? 2400;
  const height = options?.height ?? 1600;
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 48, g: 92, b: 140 },
    },
  }).jpeg({ quality: 95 });

  if (options?.exifText) {
    pipeline = sharp(await pipeline.toBuffer())
      .withMetadata({
        exif: {
          IFD0: { ImageDescription: options.exifText },
        },
      })
      .jpeg({ quality: 95 });
  }

  return pipeline.toBuffer();
}

describe("server photo ingest", () => {
  it("re-encodes to WebP under the 1 MB cap and never returns the original bytes", async () => {
    const input = await makeSource();
    const out = await compressPhotoForStorage(input);

    expect(out.contentType).toBe("image/webp");
    expect(out.bytes).toBe(out.buffer.length);
    expect(out.bytes).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(out.bytes).toBeGreaterThan(0);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MAX_PHOTO_EDGE_PX);
    expect(out.buffer.equals(input)).toBe(false);

    const sharp = (await import("sharp")).default;
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(MAX_PHOTO_EDGE_PX);
  });

  it("strips EXIF instead of storing the camera original", async () => {
    const marker = "KEEP-ME-OUT-OF-STORAGE";
    const input = await makeSource({ exifText: marker });
    expect(input.includes(Buffer.from(marker))).toBe(true);

    const out = await compressPhotoForStorage(input);
    expect(out.buffer.includes(Buffer.from(marker))).toBe(false);

    const sharp = (await import("sharp")).default;
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("returns a friendly error when the upload is not an image", async () => {
    await expect(compressPhotoForStorage(Buffer.from("not-an-image"))).rejects.toMatchObject({
      name: "PhotoCompressError",
      message: PHOTO_COMPRESS_FAILED,
    });
  });

  it("decodes HEIC to JPEG before the usual WebP/JPEG store path", async () => {
    const jpeg = await makeSource({ width: 32, height: 24 });
    const heicLike = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 1, 2, 3]);
    expect(looksLikeHeic(heicLike)).toBe(true);

    let decoded = 0;
    const readable = await ensureReadablePhotoBuffer(heicLike, async () => {
      decoded += 1;
      return jpeg;
    });
    expect(decoded).toBe(1);
    expect(readable.equals(jpeg)).toBe(true);

    const out = await compressPhotoForStorage(readable);
    expect(out.contentType).toBe("image/webp");
    expect(["image/webp", "image/jpeg"]).toContain(out.contentType);
    expect(out.buffer.equals(heicLike)).toBe(false);
    expect(out.buffer.equals(jpeg)).toBe(false);
  });

  it("leaves JPEG/PNG/WebP bytes for sharp and does not invent a HEIC decode", async () => {
    const jpeg = await makeSource({ width: 64, height: 48 });
    let decoded = 0;
    const readable = await ensureReadablePhotoBuffer(jpeg, async () => {
      decoded += 1;
      return Buffer.from("nope");
    });
    expect(decoded).toBe(0);
    expect(readable.equals(jpeg)).toBe(true);
  });

  it("decodes a real HEIC file and stores WebP or JPEG, never the camera original", async () => {
    expect(looksLikeHeic(sampleHeic)).toBe(true);
    const jpeg = await decodeHeicToJpeg(sampleHeic);
    expect(jpeg.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);

    const out = await compressPhotoForStorage(sampleHeic);
    expect(["image/webp", "image/jpeg"]).toContain(out.contentType);
    expect(out.bytes).toBeGreaterThan(0);
    expect(out.bytes).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MAX_PHOTO_EDGE_PX);
    expect(out.buffer.equals(sampleHeic)).toBe(false);
    expect(looksLikeHeic(out.buffer)).toBe(false);

    const sharp = (await import("sharp")).default;
    const meta = await sharp(out.buffer).metadata();
    expect(["webp", "jpeg"]).toContain(meta.format);
  });

  it("does not keep the original when the payload is empty", async () => {
    await expect(compressPhotoForStorage(Buffer.alloc(0))).rejects.toThrow(PHOTO_COMPRESS_FAILED);
    await expect(compressPhotoForStorage(Buffer.alloc(0))).rejects.not.toThrow(PHOTO_TOO_LARGE);
  });

  it("compresses a phone-sized original under 1 MB and drops EXIF", async () => {
    const marker = "CAMERA-ORIGINAL-EXIF";
    const input = await makeNoisySource(4032, 3024, marker);
    expect(input.length).toBeGreaterThan(MAX_PHOTO_BYTES);
    expect(input.includes(Buffer.from(marker))).toBe(true);

    const out = await compressPhotoForStorage(input);
    expect(out.contentType).toBe("image/webp");
    expect(out.bytes).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    expect(out.buffer.equals(input)).toBe(false);
    expect(out.buffer.includes(Buffer.from(marker))).toBe(false);
    expect(out.bytes).toBeLessThan(input.length / 4);
  });
});
