import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_EDGE_PX,
  PHOTO_ENCODE_QUALITY,
  PHOTO_ENCODE_QUALITY_MIN,
  PHOTO_ENCODE_QUALITY_STEP,
} from "@/lib/constants";

export type PhotoEncodeType = "image/webp" | "image/jpeg";

export const PHOTO_COMPRESS_FAILED = "Could not compress that photo. Try another.";
export const PHOTO_TOO_LARGE = "Photo is too large.";

export class PhotoCompressError extends Error {
  constructor(message: string = PHOTO_COMPRESS_FAILED) {
    super(message);
    this.name = "PhotoCompressError";
  }
}

export function scalePhotoDimensions(
  width: number,
  height: number,
  maxEdge = MAX_PHOTO_EDGE_PX,
): { width: number; height: number } {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function photoQualityLadder(
  start = PHOTO_ENCODE_QUALITY,
  min = PHOTO_ENCODE_QUALITY_MIN,
  step = PHOTO_ENCODE_QUALITY_STEP,
): number[] {
  const qualities: number[] = [];
  for (let quality = start; quality >= min - 1e-9; quality -= step) {
    qualities.push(Math.round(quality * 100) / 100);
  }
  return qualities;
}

export function choosePhotoEncodeType(supportsWebP: boolean): PhotoEncodeType {
  return supportsWebP ? "image/webp" : "image/jpeg";
}

export function isWithinPhotoBudget(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_PHOTO_BYTES;
}

export function storedPhotoExtension(contentType: string): "webp" | "jpg" {
  return contentType === "image/webp" ? "webp" : "jpg";
}

export function photoOutputName(originalName: string, contentType: PhotoEncodeType): string {
  const base = originalName.replace(/\.[^.]+$/, "").trim() || "photo";
  return `${base}.${storedPhotoExtension(contentType)}`;
}

export function sharpQuality(quality: number): number {
  return Math.min(100, Math.max(1, Math.round(quality * 100)));
}

export async function encodePhotoToBudget(input: {
  preferWebP: boolean;
  toBlob: (type: PhotoEncodeType, quality: number) => Promise<Blob | null>;
}): Promise<{ blob: Blob; type: PhotoEncodeType }> {
  const types: PhotoEncodeType[] = input.preferWebP
    ? ["image/webp", "image/jpeg"]
    : ["image/jpeg"];
  const qualities = photoQualityLadder();
  let encoded = false;

  for (const type of types) {
    for (const quality of qualities) {
      const blob = await input.toBlob(type, quality);
      if (!blob || blob.size <= 0) continue;
      encoded = true;
      if (isWithinPhotoBudget(blob.size)) {
        return { blob, type };
      }
    }
  }

  throw new PhotoCompressError(encoded ? PHOTO_TOO_LARGE : PHOTO_COMPRESS_FAILED);
}

export function canvasSupportsWebP(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  try {
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

export async function compressPhotoFile(file: File): Promise<{
  blob: Blob;
  name: string;
  width: number;
  height: number;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scalePhotoDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new PhotoCompressError();
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const { blob, type } = await encodePhotoToBudget({
      preferWebP: canvasSupportsWebP(),
      toBlob: (encodeType, quality) =>
        new Promise((resolve) => {
          canvas.toBlob((value) => resolve(value), encodeType, quality);
        }),
    });
    return {
      blob,
      name: photoOutputName(file.name, type),
      width,
      height,
    };
  } catch (error) {
    if (error instanceof PhotoCompressError) throw error;
    throw new PhotoCompressError();
  }
}
