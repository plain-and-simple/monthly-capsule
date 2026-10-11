import sharp from "sharp";
import type { CapsuleArchiveLetter, CapsuleArchivePhoto } from "@/lib/capsule-archive";

export const MAGAZINE_FOOTER_HEIGHT = 28;
export const MAGAZINE_FOOTER_GAP = 14;
export const MAGAZINE_CONTENT_BOTTOM = MAGAZINE_FOOTER_HEIGHT + MAGAZINE_FOOTER_GAP;
export const MAGAZINE_NAME_SIZE = 26;
export const MAGAZINE_COVER_SIZE = 34;
export const MAGAZINE_PULL_QUOTE_MAX = 120;
export const MAGAZINE_HERO_16_9 = 16 / 9;
export const MAGAZINE_HERO_3_2 = 3 / 2;

export type MagazineTemplate = "hero-side-stack" | "hero-text-grid" | "two-column" | "single-or-text";

export function isPortraitPhoto(photo: { width: number; height: number }): boolean {
  return photo.height > photo.width;
}

export function magazineHeroAspect(width: number, height: number): number {
  const native = width / Math.max(1, height);
  const closerToSixteenNine =
    Math.abs(native - MAGAZINE_HERO_16_9) <= Math.abs(native - MAGAZINE_HERO_3_2);
  return closerToSixteenNine ? MAGAZINE_HERO_16_9 : MAGAZINE_HERO_3_2;
}

export function selectMagazineTemplate(
  photos: readonly { width: number; height: number }[],
): MagazineTemplate {
  const count = photos.length;
  if (count <= 1) return "single-or-text";
  const firstPortrait = isPortraitPhoto(photos[0]!);
  if (count === 2 && firstPortrait) return "two-column";
  if (count === 2) return "hero-side-stack";
  const rest = photos.slice(1);
  const portraitRest = rest.filter(isPortraitPhoto).length;
  if (count <= 4 && portraitRest >= Math.ceil(rest.length / 2)) return "hero-side-stack";
  return "hero-text-grid";
}

export function magazineCoverHero(
  letters: readonly { photos: readonly CapsuleArchivePhoto[] }[],
): CapsuleArchivePhoto | null {
  for (const letter of letters) {
    const photos = [...letter.photos].sort((a, b) => a.sort_order - b.sort_order);
    if (photos[0]) return photos[0];
  }
  return null;
}

export function magazinePullQuote(body: string): string | null {
  const normalized = body.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const match = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  const sentence = (match?.[1] ?? "").trim();
  if (!sentence || sentence.length > MAGAZINE_PULL_QUOTE_MAX) return null;
  return sentence;
}

export function sortedLetterPhotos(letter: CapsuleArchiveLetter): CapsuleArchivePhoto[] {
  return [...letter.photos].sort((a, b) => a.sort_order - b.sort_order);
}

/** Center-crop to aspect, then fit inside the PDF photo budget. Never stretches. */
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
    const current = width / height;
    let left = 0;
    let top = 0;
    let cropW = width;
    let cropH = height;
    if (current > aspect + 0.001) {
      cropW = Math.max(1, Math.round(height * aspect));
      left = Math.max(0, Math.round((width - cropW) / 2));
    } else if (current < aspect - 0.001) {
      cropH = Math.max(1, Math.round(width / aspect));
      top = Math.max(0, Math.round((height - cropH) / 2));
    }
    cropW = Math.min(cropW, width - left);
    cropH = Math.min(cropH, height - top);
    const out = await sharp(bytes, { failOn: "none", sequentialRead: true })
      .rotate()
      .flatten({ background: "#ffffff" })
      .extract({ left, top, width: cropW, height: cropH })
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
