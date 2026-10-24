import sharp from "sharp";
import type { PlacedPhoto } from "@/lib/capsule-b2";

const POINTS_PER_INCH = 72;
/** Printed photos are resized to this density. */
export const PDF_PHOTO_TARGET_PPI = 200;
/** Never embed more than this. Sources already in range are kept whole. */
export const PDF_PHOTO_MAX_PPI = 220;
/** Below this, the source is too small to fill the box without upscaling. */
export const PDF_PHOTO_MIN_PPI = 150;
export const PDF_PLACED_JPEG_QUALITY = 80;

export type PlacedPhotoPrep = {
  jpeg: Uint8Array;
  /** Fractions of the layout slot. Cover is the full slot; letterbox is the contained rect. */
  left: number;
  top: number;
  width: number;
  height: number;
  effectivePpi: number;
  lowRes: boolean;
};

type Window = { left: number; top: number; width: number; height: number };

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Pixel window for the crop the template already chose. Letterbox keeps the whole frame. */
export function cropWindow(
  srcWidth: number,
  srcHeight: number,
  crop: { l: number; r: number; t: number; b: number; letterbox: boolean },
): Window {
  if (crop.letterbox || srcWidth < 1 || srcHeight < 1) {
    return { left: 0, top: 0, width: Math.max(1, srcWidth), height: Math.max(1, srcHeight) };
  }
  const left = clampInt(crop.l * srcWidth, 0, srcWidth - 1);
  const top = clampInt(crop.t * srcHeight, 0, srcHeight - 1);
  const right = clampInt((1 - crop.r) * srcWidth, left + 1, srcWidth);
  const bottom = clampInt((1 - crop.b) * srcHeight, top + 1, srcHeight);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Output pixel size for a printed box.
 * At or under 220 ppi the crop is kept at its own size. Above that it is reduced to 200.
 * The box is never filled by enlarging the source.
 */
export function placedOutputSize(
  cropWidth: number,
  cropHeight: number,
  boxWidthPt: number,
  boxHeightPt: number,
): { width: number; height: number; effectivePpi: number; lowRes: boolean } {
  const inchesW = boxWidthPt / POINTS_PER_INCH;
  const inchesH = boxHeightPt / POINTS_PER_INCH;
  const safeW = Math.max(inchesW, 1e-6);
  const safeH = Math.max(inchesH, 1e-6);
  const sourcePpi = Math.min(cropWidth / safeW, cropHeight / safeH);
  const ppi = sourcePpi > PDF_PHOTO_MAX_PPI ? PDF_PHOTO_TARGET_PPI : sourcePpi;
  let width = Math.max(1, Math.round(safeW * ppi));
  let height = Math.max(1, Math.round(safeH * ppi));
  if (width > cropWidth || height > cropHeight) {
    const fit = Math.min(cropWidth / width, cropHeight / height);
    width = Math.max(1, Math.floor(width * fit));
    height = Math.max(1, Math.floor(height * fit));
  }
  const maxW = Math.max(1, Math.floor(safeW * PDF_PHOTO_MAX_PPI));
  const maxH = Math.max(1, Math.floor(safeH * PDF_PHOTO_MAX_PPI));
  if (width > maxW || height > maxH) {
    const fit = Math.min(maxW / width, maxH / height);
    width = Math.max(1, Math.floor(width * fit));
    height = Math.max(1, Math.floor(height * fit));
  }
  const effectivePpi = Math.min(width / safeW, height / safeH);
  return { width, height, effectivePpi, lowRes: effectivePpi < PDF_PHOTO_MIN_PPI };
}

function containedBox(slotW: number, slotH: number, imageW: number, imageH: number) {
  const imageAspect = imageW / imageH;
  const slotAspect = slotW / slotH;
  const boxW = imageAspect > slotAspect ? slotW : slotH * imageAspect;
  const boxH = imageAspect > slotAspect ? slotW / imageAspect : slotH;
  return {
    boxW,
    boxH,
    left: (slotW - boxW) / 2 / slotW,
    top: (slotH - boxH) / 2 / slotH,
    width: boxW / slotW,
    height: boxH / slotH,
  };
}

export function isBaselineJpeg(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] !== 0xff) continue;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0x00 || marker === 0xff) continue;
    if (marker === 0xc0) return true;
    if (marker === 0xc2) return false;
  }
  return false;
}

/** Crop, size, and encode one placed photo so the page can show it without a CSS crop or scale. */
export async function preparePlacedPhotoJpeg(
  bytes: Uint8Array,
  photo: PlacedPhoto,
): Promise<PlacedPhotoPrep | null> {
  if (bytes.length === 0 || !(photo.w > 1) || !(photo.h > 1)) return null;
  try {
    // metadata() is the file header, before EXIF rotation. Rasterize first so the crop uses upright pixels.
    const oriented = await sharp(Buffer.from(bytes), { failOn: "none" })
      .rotate()
      .toColorspace("srgb")
      .flatten({ background: "#ffffff" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const srcW = oriented.info.width;
    const srcH = oriented.info.height;
    const channels = oriented.info.channels;
    if (srcW < 1 || srcH < 1 || channels < 3) return null;

    const contain = photo.fit === "contain" || photo.crop.letterbox;
    const frame = contain
      ? containedBox(photo.w, photo.h, srcW, srcH)
      : { boxW: photo.w, boxH: photo.h, left: 0, top: 0, width: 1, height: 1 };
    const window = contain
      ? { left: 0, top: 0, width: srcW, height: srcH }
      : cropWindow(srcW, srcH, photo.crop);
    const size = placedOutputSize(window.width, window.height, frame.boxW, frame.boxH);

    let pipeline = sharp(oriented.data, {
      raw: { width: srcW, height: srcH, channels },
      failOn: "none",
    });
    if (window.left !== 0 || window.top !== 0 || window.width !== srcW || window.height !== srcH) {
      pipeline = pipeline.extract(window);
    }
    if (window.width !== size.width || window.height !== size.height) {
      pipeline = pipeline.resize(size.width, size.height, {
        fit: "fill",
        withoutEnlargement: true,
      });
    }
    const encoded = await pipeline
      .jpeg({
        quality: PDF_PLACED_JPEG_QUALITY,
        progressive: false,
        mozjpeg: false,
        chromaSubsampling: "4:2:0",
        optimizeCoding: true,
      })
      .toBuffer({ resolveWithObject: true });
    const width = encoded.info.width ?? size.width;
    const height = encoded.info.height ?? size.height;
    const effectivePpi = Math.min(width / (frame.boxW / POINTS_PER_INCH), height / (frame.boxH / POINTS_PER_INCH));
    return {
      jpeg: new Uint8Array(encoded.data),
      left: frame.left,
      top: frame.top,
      width: frame.width,
      height: frame.height,
      effectivePpi,
      lowRes: effectivePpi < PDF_PHOTO_MIN_PPI,
    };
  } catch {
    return null;
  }
}
