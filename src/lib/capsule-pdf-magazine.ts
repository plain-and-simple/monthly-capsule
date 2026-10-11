import sharp from "sharp";
import type { CapsuleArchiveLetter, CapsuleArchivePhoto } from "@/lib/capsule-archive";

export const MAGAZINE_FOOTER_HEIGHT = 28;
export const MAGAZINE_FOOTER_GAP = 14;
export const MAGAZINE_CONTENT_BOTTOM = MAGAZINE_FOOTER_HEIGHT + MAGAZINE_FOOTER_GAP;
export const MAGAZINE_NAME_SIZE = 26;
export const MAGAZINE_COVER_SIZE = 34;
export const MAGAZINE_COVER_KICKER = "newsletter";
export const MAGAZINE_HERO_16_9 = 16 / 9;
export const MAGAZINE_HERO_3_2 = 3 / 2;
export const MAGAZINE_BODY_SIZE = 11;
export const MAGAZINE_BODY_SIZE_DENSE = 10.5;
export const MAGAZINE_BODY_LINE_GAP = 3.5;
export const MAGAZINE_TWO_COL_GUTTER = 14;
export const MAGAZINE_SHARE_PAGE_FRACTION = 1 / 3;
export const MAGAZINE_GRID_EXTRA_MIN = 5;
export const MAGAZINE_INLINE_MAX = 3;
export const MAGAZINE_CROP_FACE_BIAS = 0.28;
export const MAGAZINE_PHOTO_ROW_H = 168;
export const MAGAZINE_PHOTO_ROW_MIN_H = 100;
export const MAGAZINE_PHOTO_MIN_SHORT = 100;
export const MAGAZINE_LONG_LETTER_CHARS = 520;
export const MAGAZINE_SIDE_FRACTION = 0.38;

export type MagazineTemplate =
  | "hero-side-stack"
  | "hero-inline"
  | "hero-text-grid"
  | "two-column"
  | "single-or-text";

export type MagazinePersonPlan<T extends { width: number; height: number } = { width: number; height: number }> = {
  template: MagazineTemplate;
  hero: T | null;
  columnPhoto: T | null;
  inline: T[];
  grid: T[];
};

export function isPortraitPhoto(photo: { width: number; height: number }): boolean {
  return photo.height > photo.width;
}

export function isLandscapePhoto(photo: { width: number; height: number }): boolean {
  return photo.width >= photo.height;
}

export function firstLandscapeIndex(photos: readonly { width: number; height: number }[]): number {
  return photos.findIndex((photo) => isLandscapePhoto(photo));
}

export function personHeroPhoto<T extends { width: number; height: number }>(photos: readonly T[]): T | null {
  const index = firstLandscapeIndex(photos);
  if (index >= 0) return photos[index]!;
  return photos[0] ?? null;
}

/** Landscape only. Never crop a portrait to 3:2. */
export function magazineHeroAspect(width: number, height: number): number | null {
  if (height > width) return null;
  const native = width / Math.max(1, height);
  const closerToSixteenNine =
    Math.abs(native - MAGAZINE_HERO_16_9) <= Math.abs(native - MAGAZINE_HERO_3_2);
  return closerToSixteenNine ? MAGAZINE_HERO_16_9 : MAGAZINE_HERO_3_2;
}

function splitInlineAndGrid<T>(rest: T[]): { inline: T[]; grid: T[] } {
  if (rest.length > MAGAZINE_GRID_EXTRA_MIN) {
    return { inline: rest.slice(0, MAGAZINE_INLINE_MAX), grid: rest.slice(MAGAZINE_INLINE_MAX) };
  }
  return { inline: [...rest], grid: [] };
}

export function planMagazinePerson<T extends { width: number; height: number }>(
  photos: readonly T[],
): MagazinePersonPlan<T> {
  if (photos.length === 0) {
    return { template: "single-or-text", hero: null, columnPhoto: null, inline: [], grid: [] };
  }
  const land = firstLandscapeIndex(photos);
  if (land < 0) {
    const columnPhoto = photos[0]!;
    const { inline, grid } = splitInlineAndGrid(photos.slice(1));
    return { template: "two-column", hero: null, columnPhoto, inline, grid };
  }
  const hero = photos[land]!;
  const rest = photos.filter((_, index) => index !== land);
  if (rest.length === 0) {
    return { template: "single-or-text", hero, columnPhoto: null, inline: [], grid: [] };
  }
  const { inline, grid } = splitInlineAndGrid(rest);
  if (grid.length > 0) {
    return { template: "hero-text-grid", hero, columnPhoto: null, inline, grid };
  }
  const portraitRest = rest.filter(isPortraitPhoto).length;
  if (portraitRest >= Math.ceil(rest.length / 2)) {
    return { template: "hero-side-stack", hero, columnPhoto: null, inline, grid: [] };
  }
  return { template: "hero-inline", hero, columnPhoto: null, inline, grid: [] };
}

export function selectMagazineTemplate(
  photos: readonly { width: number; height: number }[],
): MagazineTemplate {
  return planMagazinePerson(photos).template;
}

export function magazineCoverPhotos(
  letters: readonly { photos: readonly CapsuleArchivePhoto[] }[],
): CapsuleArchivePhoto[] {
  const picks: CapsuleArchivePhoto[] = [];
  for (const letter of letters) {
    if (picks.length >= 4) break;
    const photos = [...letter.photos].sort((a, b) => a.sort_order - b.sort_order);
    if (photos.length < 2) continue;
    const landscape = photos.find((photo) => isLandscapePhoto(photo));
    picks.push(landscape ?? photos[photos.length - 1]!);
  }
  return picks;
}

export function magazineMinRowHeight(
  aspects: readonly number[],
  minShort = MAGAZINE_PHOTO_MIN_SHORT,
): number {
  let minH = minShort;
  for (const aspect of aspects) {
    const ratio = aspect > 0 ? aspect : 1;
    if (ratio < 1) minH = Math.max(minH, minShort / ratio);
  }
  return minH;
}

export function magazineRowCountForMinShort(
  aspects: readonly number[],
  contentWidth: number,
  gap: number,
  minShort = MAGAZINE_PHOTO_MIN_SHORT,
): number {
  let count = Math.min(3, aspects.length);
  while (count > 1) {
    const slice = aspects.slice(0, count).map((aspect) => (aspect > 0 ? aspect : 1));
    const sumA = slice.reduce((sum, aspect) => sum + aspect, 0);
    const height = (contentWidth - gap * (count - 1)) / Math.max(sumA, 0.001);
    const shorts = slice.map((aspect) => Math.min(aspect * height, height));
    if (shorts.every((side) => side + 0.05 >= minShort)) return count;
    count -= 1;
  }
  return Math.min(1, aspects.length);
}

export function magazineUsesTwoTextColumns(body: string): boolean {
  return body.replace(/\s+/g, " ").trim().length >= MAGAZINE_LONG_LETTER_CHARS;
}

export function sortedLetterPhotos(letter: CapsuleArchiveLetter): CapsuleArchivePhoto[] {
  return [...letter.photos].sort((a, b) => a.sort_order - b.sort_order);
}

export function cropRectForAspect(
  width: number,
  height: number,
  aspect: number,
): { left: number; top: number; width: number; height: number } {
  const current = width / Math.max(1, height);
  let left = 0;
  let top = 0;
  let cropW = width;
  let cropH = height;
  if (current > aspect + 0.001) {
    cropW = Math.max(1, Math.round(height * aspect));
    left = Math.max(0, Math.round((width - cropW) / 2));
  } else if (current < aspect - 0.001) {
    cropH = Math.max(1, Math.round(width / aspect));
    const slack = Math.max(0, height - cropH);
    top = Math.max(0, Math.round(slack * MAGAZINE_CROP_FACE_BIAS));
  }
  cropW = Math.min(cropW, width - left);
  cropH = Math.min(cropH, height - top);
  return { left, top, width: cropW, height: cropH };
}

/** Crop to aspect, biased toward the upper-middle (faces). Never stretches. */
export async function cropJpegToAspect(
  bytes: Uint8Array,
  aspect: number,
): Promise<Uint8Array | null> {
  if (bytes.length === 0 || !(aspect > 0)) return null;
  try {
    const base = sharp(bytes, { failOn: "none", sequentialRead: true })
      .rotate()
      .flatten({ background: "#ffffff" });
    const meta = await base.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 2 || height < 2) return null;
    const rect = cropRectForAspect(width, height, aspect);
    const out = await sharp(bytes, { failOn: "none", sequentialRead: true })
      .rotate()
      .flatten({ background: "#ffffff" })
      .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

export type MagazineCoverCell = { x: number; y: number; w: number; h: number };

export function magazineCoverCells(
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
): MagazineCoverCell[] {
  const gap = 5;
  if (count >= 4) {
    const cw = (w - gap) / 2;
    const ch = (h - gap) / 2;
    return [
      { x, y: y + ch + gap, w: cw, h: ch },
      { x: x + cw + gap, y: y + ch + gap, w: cw, h: ch },
      { x, y, w: cw, h: ch },
      { x: x + cw + gap, y, w: cw, h: ch },
    ];
  }
  if (count === 3) {
    const leftW = w * 0.58;
    const rightW = w - leftW - gap;
    const rh = (h - gap) / 2;
    return [
      { x, y, w: leftW, h },
      { x: x + leftW + gap, y: y + rh + gap, w: rightW, h: rh },
      { x: x + leftW + gap, y, w: rightW, h: rh },
    ];
  }
  if (count === 2) {
    const cw = (w - gap) / 2;
    return [
      { x, y, w: cw, h },
      { x: x + cw + gap, y, w: cw, h },
    ];
  }
  return [{ x, y, w, h }];
}
