import "server-only";
import convert from "heic-convert";
import sharp from "sharp";
import { MAX_PHOTO_EDGE_PX } from "@/lib/constants";
import {
  PHOTO_COMPRESS_FAILED,
  PHOTO_TOO_LARGE,
  PhotoCompressError,
  isWithinPhotoBudget,
  photoQualityLadder,
  sharpQuality,
  type PhotoEncodeType,
} from "@/lib/photo-compress";
import { looksLikeHeic } from "@/lib/photo-files";

export type CompressedPhoto = {
  buffer: Buffer;
  contentType: PhotoEncodeType;
  width: number;
  height: number;
  bytes: number;
};

type SharpPipeline = ReturnType<typeof sharp>;

type EncodedPhoto = {
  data: Buffer;
  width: number;
  height: number;
  contentType: PhotoEncodeType;
};

async function encodeAttempt(
  pipeline: SharpPipeline,
  contentType: PhotoEncodeType,
  quality: number,
): Promise<EncodedPhoto | null> {
  try {
    const q = sharpQuality(quality);
    const result =
      contentType === "image/webp"
        ? await pipeline.clone().webp({ quality: q, effort: 4 }).toBuffer({ resolveWithObject: true })
        : await pipeline
            .clone()
            .jpeg({ quality: q, mozjpeg: true })
            .toBuffer({ resolveWithObject: true });
    return {
      data: result.data,
      width: result.info.width,
      height: result.info.height,
      contentType,
    };
  } catch {
    return null;
  }
}

function toCompressed(encoded: EncodedPhoto): CompressedPhoto {
  return {
    buffer: encoded.data,
    contentType: encoded.contentType,
    width: Math.max(1, encoded.width),
    height: Math.max(1, encoded.height),
    bytes: encoded.data.length,
  };
}

export async function decodeHeicToJpeg(input: Buffer): Promise<Buffer> {
  const jpeg = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.9,
  });
  return Buffer.from(jpeg);
}

export async function sharpCanRead(input: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    return Boolean(meta.width && meta.height);
  } catch {
    return false;
  }
}

/**
 * Sharp's prebuilt libvips often decodes AVIF but not iPhone HEVC HEIC.
 * Convert those to JPEG first, then the usual WebP/JPEG storage pipeline.
 */
export async function ensureReadablePhotoBuffer(
  input: Buffer,
  decodeHeic: (buf: Buffer) => Promise<Buffer> = decodeHeicToJpeg,
): Promise<Buffer> {
  if (await sharpCanRead(input)) return input;
  if (!looksLikeHeic(input)) return input;
  try {
    return await decodeHeic(input);
  } catch {
    throw new PhotoCompressError();
  }
}

/**
 * Re-encode for storage: max edge 1600, WebP (JPEG fallback), EXIF stripped.
 * Never returns the input bytes. HEIC is decoded first, never stored.
 */
export async function compressPhotoForStorage(input: Buffer): Promise<CompressedPhoto> {
  if (!input.length) {
    throw new PhotoCompressError();
  }

  const readable = await ensureReadablePhotoBuffer(input);

  let pipeline: SharpPipeline;
  try {
    pipeline = sharp(readable, { failOn: "none", sequentialRead: true })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({
        width: MAX_PHOTO_EDGE_PX,
        height: MAX_PHOTO_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      });
    await pipeline.clone().metadata();
  } catch {
    throw new PhotoCompressError();
  }

  const types: PhotoEncodeType[] = ["image/webp", "image/jpeg"];
  let lastValid: EncodedPhoto | null = null;

  for (const contentType of types) {
    for (const quality of photoQualityLadder()) {
      const encoded = await encodeAttempt(pipeline, contentType, quality);
      if (!encoded) continue;
      lastValid = encoded;
      if (isWithinPhotoBudget(encoded.data.length)) {
        return toCompressed(encoded);
      }
    }
  }

  if (!lastValid) {
    throw new PhotoCompressError(PHOTO_COMPRESS_FAILED);
  }
  throw new PhotoCompressError(PHOTO_TOO_LARGE);
}
