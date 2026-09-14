import "server-only";
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

/**
 * Re-encode for storage: max edge 1600, WebP (JPEG fallback), EXIF stripped.
 * Never returns the input bytes.
 */
export async function compressPhotoForStorage(input: Buffer): Promise<CompressedPhoto> {
  if (!input.length) {
    throw new PhotoCompressError();
  }

  let pipeline: SharpPipeline;
  try {
    pipeline = sharp(input, { failOn: "none", sequentialRead: true })
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
