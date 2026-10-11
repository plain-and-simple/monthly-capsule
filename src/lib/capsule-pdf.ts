import { PDFDocument, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import sharp from "sharp";
import type { CapsuleArchive, CapsuleArchiveLetter, CapsuleArchivePhoto } from "@/lib/capsule-archive";
import {
  CAPSULE_PDF_PRODUCER,
  drawPdfRuns,
  embedCapsulePdfFonts,
  embedMagazineDisplayFont,
  layoutPdfRuns,
  takePdfLine,
  widthOfPdfRuns,
  widthOfPdfText,
  type CapsulePdfFonts,
  type PdfTypeFace,
} from "@/lib/capsule-pdf-fonts";
import {
  cropJpegToAspect,
  isPortraitPhoto,
  MAGAZINE_BODY_LINE_GAP,
  MAGAZINE_BODY_SIZE,
  MAGAZINE_BODY_SIZE_DENSE,
  MAGAZINE_CONTENT_BOTTOM,
  MAGAZINE_COVER_KICKER,
  MAGAZINE_COVER_SIZE,
  MAGAZINE_FEATURE_MAX_H,
  MAGAZINE_HERO_16_9,
  MAGAZINE_FOOTER_HEIGHT,
  MAGAZINE_NAME_SIZE,
  MAGAZINE_PHOTO_MIN_SHORT,
  MAGAZINE_PHOTO_ROW_H,
  MAGAZINE_SIDE_FRACTION,
  MAGAZINE_TWO_COL_GUTTER,
  magazineCoverCells,
  magazineCoverPhotos,
  magazineMinRowHeight,
  magazineRowCountForMinShort,
  magazineHeroAspect,
  magazineUsesTwoTextColumns,
  planMagazinePerson,
  sortedLetterPhotos,
} from "@/lib/capsule-pdf-magazine";
import {
  capsuleThemeMeta,
  layoutPersonSection,
  letterParagraphs,
  parseCapsuleTheme,
  plateLabel,
  type CapsuleTheme,
  type LetterBlock,
} from "@/lib/capsule-theme";
import { contributorsLine, DOWNLOAD_PDF_LABEL, groupDisplayName } from "@/lib/copy";
import { capsulePath, capsuleTitle, DEFAULT_MONTH_VERSION } from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";
import { missedCountPhrase } from "@/lib/submit";

export {
  CAPSULE_PDF_PRODUCER,
  capsulePdfNeedsUnicodeRerender,
  selectEnsuredCapsulePdf,
} from "@/lib/capsule-pdf-fonts";

export { DOWNLOAD_PDF_LABEL };
export const PDF_CONTENT_TYPE = "application/pdf";
export const PDF_PHOTO_MAX_EDGE = 1200;
export const PDF_PHOTO_JPEG_QUALITY = 70;

export const PDF_PAGE_WIDTH = 612;
export const PDF_PAGE_HEIGHT = 792;
export const PDF_MARGIN = 54;
export const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
export const PDF_BODY_SIZE = 12;
export const PDF_BODY_LINE_GAP = 4;
export const PDF_PARAGRAPH_GAP = 8;
export const PDF_HEADING_GAP = 12;
export const PDF_PAGE_CONTENT_HEIGHT = PDF_PAGE_HEIGHT - PDF_MARGIN * 2;
export const PDF_WRAP_CLEAR_GAP = 10;
export const PDF_SIDE_PHOTO_MIN = 110;
export const PDF_SIDE_PHOTO_MIN_LONG = 140;
export const PDF_SIDE_PHOTO_MAX = 210;
export const PDF_LEFTOVER_MAX_H = 260;
export const PDF_LEFTOVER_STRIP_MAX_H = 220;
export const PDF_LEFTOVER_GAP = 8;
export const PDF_SIDE_PHOTO_FRACTION = 0.42;
export const PDF_SIDE_PHOTO_GUTTER = 14;
export const PDF_PHOTO_SHRINK_MIN = 120;
export const PDF_PHOTO_ENSURE_PAD = 16;

const PAGE_WIDTH = PDF_PAGE_WIDTH;
const PAGE_HEIGHT = PDF_PAGE_HEIGHT;
const MARGIN = PDF_MARGIN;
const CONTENT_WIDTH = PDF_CONTENT_WIDTH;

export type CapsulePdfLayoutEvent = {
  kind: "heading" | "photo" | "text" | "page" | "footer";
  page: number;
  y: number;
  name?: string;
  person?: string;
  text?: string;
  x?: number;
  width?: number;
  bottom?: number;
  height?: number;
  storage_path?: string;
};

export function pdfLineBoxHeight(font: PdfTypeFace, size: number): number {
  return font.font.heightAtSize(size, { descender: true });
}

export function lineBoxOverlapsWrap(
  lineTop: number,
  lineBoxHeight: number,
  wrapBottom: number,
  gap = PDF_WRAP_CLEAR_GAP,
): boolean {
  const lineBottom = lineTop - lineBoxHeight;
  const clearY = wrapBottom - gap;
  return lineTop > clearY && lineBottom < lineTop;
}

export function layoutBoxesOverlap(
  a: { page: number; x: number; y: number; width: number; height: number },
  b: { page: number; x: number; y: number; width: number; height: number },
): boolean {
  if (a.page !== b.page) return false;
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y > b.y - b.height && a.y - a.height < b.y;
}

export function headingSizeForTheme(theme: CapsuleTheme): number {
  if (theme === "magazine") return MAGAZINE_NAME_SIZE;
  return theme === "heritage" ? 16 : 18;
}

export function sideTextColumnWidth(): number {
  return CONTENT_WIDTH - CONTENT_WIDTH * PDF_SIDE_PHOTO_FRACTION - PDF_SIDE_PHOTO_GUTTER;
}

export function clampSidePhotoHeight(textHeight: number): number {
  const min = textHeight >= PDF_SIDE_PHOTO_MIN ? PDF_SIDE_PHOTO_MIN_LONG : PDF_SIDE_PHOTO_MIN;
  return Math.min(PDF_SIDE_PHOTO_MAX, Math.max(min, textHeight));
}

export function shrinkSidePhotoToRemaining(
  drawH: number,
  remaining: number,
): { height: number; pageBreak: boolean } {
  if (remaining >= drawH + PDF_PHOTO_ENSURE_PAD) {
    return { height: drawH, pageBreak: false };
  }
  if (remaining >= PDF_PHOTO_SHRINK_MIN) {
    return { height: Math.min(drawH, Math.max(1, remaining - PDF_PHOTO_ENSURE_PAD)), pageBreak: false };
  }
  return { height: drawH, pageBreak: true };
}

export function headingKeepWithNextNeeded(input: {
  headingSize: number;
  headingGap: number;
  firstTextHeight: number;
  photoHeight?: number;
  pageContentHeight?: number;
}): number {
  const content = Math.max(Math.max(0, input.firstTextHeight), Math.max(0, input.photoHeight ?? 0));
  const raw = input.headingSize + input.headingGap + content;
  const cap = input.pageContentHeight ?? PDF_PAGE_CONTENT_HEIGHT;
  return Math.min(raw, cap);
}

export function headingKeepWithNextFits(y: number, needed: number, margin = MARGIN): boolean {
  return y - needed >= margin;
}

export function estimateWrappedHeight(
  text: string,
  font: PdfTypeFace,
  emoji: PdfTypeFace,
  size: number,
  lineGap: number,
  width: number,
): number {
  let height = 0;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const words = (line || " ").split(/\s+/).filter(Boolean);
    let remaining = words.length > 0 ? words : [""];
    while (remaining.length > 0) {
      const taken = takeLine(remaining, font, emoji, size, width);
      height += size + lineGap;
      remaining = taken.rest;
    }
  }
  return height;
}

export function leftoverGalleryCols(
  variant: "grid" | "strip",
  photos: readonly { width: number; height: number }[],
): number {
  if (variant === "strip") return 3;
  if (photos.length < 3) return 2;
  const portraits = photos.filter((photo) => photo.height > photo.width).length;
  return portraits >= photos.length / 2 ? 3 : 2;
}

export function packLeftoverRowCounts(count: number): number[] {
  if (count <= 0) return [];
  const rows: number[] = [];
  let left = count;
  while (left > 3) {
    if (left === 4) {
      rows.push(2);
      left = 2;
      break;
    }
    rows.push(3);
    left -= 3;
  }
  if (left === 1 && rows.length > 0) {
    rows[rows.length - 1] -= 1;
    rows.push(2);
  } else if (left > 0) {
    rows.push(left);
  }
  return rows;
}

export function justifiedRowMetrics(
  aspects: readonly number[],
  contentWidth: number,
  gap: number,
  maxH: number,
): { height: number; widths: number[]; usedWidth: number } {
  const positive = aspects.map((aspect) => (aspect > 0 ? aspect : 1));
  const sumA = positive.reduce((sum, aspect) => sum + aspect, 0);
  if (positive.length === 0 || sumA <= 0) {
    return { height: 0, widths: [], usedWidth: 0 };
  }
  const height = Math.min(maxH, (contentWidth - gap * (positive.length - 1)) / sumA);
  const widths = positive.map((aspect) => aspect * height);
  const usedWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (positive.length - 1);
  return { height, widths, usedWidth };
}

export function measureTextBesidePhoto(input: {
  text: string;
  font: PdfTypeFace;
  emoji: PdfTypeFace;
  size: number;
  lineGap: number;
  insetWidth: number;
  fullWidth: number;
  photoHeight: number;
}): number {
  let height = 0;
  const boxH = pdfLineBoxHeight(input.font, input.size);
  for (const raw of input.text.replace(/\r\n/g, "\n").split("\n")) {
    const words = (raw || " ").split(/\s+/).filter(Boolean);
    let remaining = words.length > 0 ? words : [""];
    while (remaining.length > 0) {
      const width = lineBoxOverlapsWrap(0 - height, boxH, 0 - input.photoHeight)
        ? input.insetWidth
        : input.fullWidth;
      const taken = takeLine(remaining, input.font, input.emoji, input.size, width);
      height += input.size + input.lineGap;
      remaining = taken.rest;
    }
  }
  return height;
}

export type CapsulePdfPhotoBytes = {
  storage_path: string;
  bytes: Uint8Array;
};

export type PdfPalette = {
  paper: RGB;
  ink: RGB;
  accent: RGB;
  muted: RGB;
  rule: RGB;
};

export function capsulePdfStoragePath(
  groupId: string,
  yearMonth: string,
  version: number,
): string {
  const edition = Number.isInteger(version) && version >= 1 ? version : DEFAULT_MONTH_VERSION;
  return `${groupId}/pdfs/${yearMonth}/v${edition}.pdf`;
}

export function capsulePdfFilename(groupName: string, yearMonth: string, version: number): string {
  const slug = groupDisplayName(groupName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const base = slug || "capsule";
  const edition = Number.isInteger(version) && version >= 1 ? version : DEFAULT_MONTH_VERSION;
  return `${base}-${yearMonth}${edition > 1 ? `-v${edition}` : ""}.pdf`;
}

export function capsulePdfHref(groupId: string, yearMonth: string, version: number): string {
  return `/g/${groupId}/capsule/${capsulePath(yearMonth, version)}/pdf`;
}

export function pdfContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function detectImageKind(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function themePdfPalette(theme: CapsuleTheme): PdfPalette {
  const swatch = capsuleThemeMeta(theme);
  const paper = hexRgb(swatch.colors[0]!);
  const ink = hexRgb(swatch.colors[1]!);
  const accent = hexRgb(swatch.colors[2]!);
  return {
    paper,
    ink,
    accent,
    muted: mixRgb(ink, paper, 0.42),
    rule: mixRgb(accent, paper, 0.5),
  };
}

/** Re-encode any photo (JPEG/PNG/WebP) to a PDF-safe JPEG. */
export async function preparePdfJpeg(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes.length === 0) return null;
  try {
    const out = await sharp(bytes, { failOn: "none", sequentialRead: true })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({
        width: PDF_PHOTO_MAX_EDGE,
        height: PDF_PHOTO_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: PDF_PHOTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

export async function buildCapsulePdfBytes(input: {
  archive: CapsuleArchive;
  photos: readonly CapsulePdfPhotoBytes[];
  monthLabelText?: string;
  layout?: CapsulePdfLayoutEvent[];
}): Promise<Uint8Array> {
  const theme = parseCapsuleTheme(input.archive.theme);
  const palette = themePdfPalette(theme);
  const doc = await PDFDocument.create();
  stampCapsulePdfProducer(doc);
  const fonts = await embedCapsulePdfFonts(doc);
  const photoByPath = new Map(input.photos.map((photo) => [photo.storage_path, photo.bytes]));

  const title =
    input.monthLabelText ??
    capsuleTitle(monthLabel(input.archive.year_month), input.archive.month_version);
  const groupName = groupDisplayName(input.archive.group_name);
  if (theme === "magazine") {
    await drawMagazineIssue(doc, {
      archive: input.archive,
      fonts,
      palette,
      photoByPath,
      title,
      groupName,
      layout: input.layout,
    });
    return doc.save({ useObjectStreams: false });
  }
  const cursor = new PdfCursor(doc, palette, fonts.emoji, PAGE_HEIGHT - MARGIN, input.layout);

  drawCover(cursor, theme, fonts, {
    groupName,
    title,
    names: input.archive.letters.map((letter) => letter.preferred_name),
  });

  if (input.archive.letters.length === 0) {
    cursor.wrapped("No letters this month.", {
      font: fonts.serifItalic,
      size: 13,
      lineGap: 4,
      color: palette.muted,
    });
  } else {
    for (let i = 0; i < input.archive.letters.length; i += 1) {
      const letter = input.archive.letters[i]!;
      if (i > 0) cursor.letterRule(theme);
      await drawPerson(doc, cursor, theme, letter, fonts, photoByPath);
    }
  }

  cursor.y -= 16;
  cursor.rule(10);
  cursor.wrapped(missedCountPhrase(input.archive.missed_count), {
    font: theme === "heritage" || theme === "warm" ? fonts.serifItalic : fonts.sans,
    size: 10,
    lineGap: 3,
    color: palette.muted,
  });

  return doc.save({ useObjectStreams: false });
}

function stampCapsulePdfProducer(doc: PDFDocument) {
  doc.setProducer(CAPSULE_PDF_PRODUCER);
  doc.setCreator(CAPSULE_PDF_PRODUCER);
  doc.setKeywords([CAPSULE_PDF_PRODUCER]);
}

function drawCover(
  cursor: PdfCursor,
  theme: CapsuleTheme,
  fonts: CapsulePdfFonts,
  input: {
    groupName: string;
    title: string;
    names: string[];
  },
) {
  const names = contributorsLine(input.names);
  if (theme === "warm") {
    cursor.ribbon(input.title, fonts.sans);
    cursor.text(input.groupName, {
      font: fonts.serifBold,
      size: 28,
      color: cursor.palette.ink,
      gap: 10,
    });
  } else if (theme === "minimal") {
    cursor.text("Capsule", {
      font: fonts.sans,
      size: 9,
      color: cursor.palette.muted,
      gap: 8,
    });
    cursor.text(input.title, {
      font: fonts.serifBold,
      size: 26,
      color: cursor.palette.ink,
      gap: 8,
    });
    cursor.text(input.groupName, {
      font: fonts.sans,
      size: 12,
      color: cursor.palette.muted,
      gap: 8,
    });
  } else if (theme === "heritage") {
    cursor.text("A keepsake", {
      font: fonts.serifItalic,
      size: 11,
      color: cursor.palette.accent,
      gap: 8,
      center: true,
    });
    cursor.text(input.title, {
      font: fonts.serifBold,
      size: 26,
      color: cursor.palette.ink,
      gap: 8,
      center: true,
    });
    cursor.text(input.groupName, {
      font: fonts.serif,
      size: 12,
      color: cursor.palette.muted,
      gap: 10,
      center: true,
    });
  } else {
    cursor.text(input.groupName.toUpperCase(), {
      font: fonts.sans,
      size: 9,
      color: cursor.palette.muted,
      gap: 8,
    });
    cursor.text(input.title, {
      font: fonts.serifBold,
      size: 28,
      color: cursor.palette.ink,
      gap: 10,
    });
  }

  if (names) {
    cursor.wrapped(names, {
      font: fonts.sans,
      size: 11,
      lineGap: 3,
      color: cursor.palette.muted,
      paragraphGap: 6,
      center: theme === "heritage",
    });
  }
  cursor.rule(theme === "heritage" ? 16 : 22);
  if (theme === "heritage") cursor.rule(22);
}

async function drawPerson(
  doc: PDFDocument,
  cursor: PdfCursor,
  theme: CapsuleTheme,
  letter: CapsuleArchiveLetter,
  fonts: CapsulePdfFonts,
  photoByPath: Map<string, Uint8Array>,
) {
  const blocks = layoutPersonSection(theme, letter);
  cursor.finishWrap();
  cursor.setPerson(letter.preferred_name);

  const heading = blocks[0]?.kind === "heading" ? blocks[0] : null;
  const rest = heading ? blocks.slice(1) : blocks;
  if (heading) {
    await drawPersonHeading(cursor, theme, heading.name, rest, fonts, letter.preferred_name);
  }

  const queued: Array<{
    block: Extract<LetterBlock, { kind: "photo"; variant: "weave" }>;
    pairedText: string;
  }> = [];

  const pairedTextAt = (from: number): string => {
    for (let j = from + 1; j < rest.length; j += 1) {
      const next = rest[j]!;
      if (next.kind === "text") return next.text;
      if (next.kind === "photo") break;
    }
    return "";
  };

  const remainingTextAfter = (from: number): boolean =>
    rest.slice(from + 1).some((entry) => entry.kind === "text");

  const flushLeftoverWeaves = async () => {
    const items: Array<{ image: PDFImage; storage_path?: string }> = [];
    while (queued.length > 0) {
      const next = queued.shift()!;
      const image = await embedPhoto(doc, photoByPath.get(next.block.photo.storage_path));
      if (image) items.push({ image, storage_path: next.block.photo.storage_path });
    }
    if (items.length === 0) return;
    cursor.finishWrap();
    await cursor.leftoverJustified(items, { maxH: PDF_LEFTOVER_MAX_H, gap: PDF_LEFTOVER_GAP });
  };

  const placeQueued = async (inset: boolean) => {
    if (!inset) {
      await flushLeftoverWeaves();
      return;
    }
    while (queued.length > 0 && !cursor.hasActiveWrap()) {
      const next = queued.shift()!;
      await placeWeavePhoto(doc, cursor, next.block, fonts, photoByPath, next.pairedText, true);
    }
  };

  for (let i = 0; i < rest.length; i += 1) {
    const block = rest[i]!;
    if (block.kind === "photo" && block.variant === "weave") {
      if (cursor.hasActiveWrap()) {
        queued.push({ block, pairedText: pairedTextAt(i) });
        continue;
      }
      await placeWeavePhoto(
        doc,
        cursor,
        block,
        fonts,
        photoByPath,
        pairedTextAt(i),
        remainingTextAfter(i),
      );
      continue;
    }
    if (block.kind === "text") {
      drawLetterText(cursor, fonts, block.text, letter.preferred_name);
      await placeQueued(remainingTextAfter(i));
      continue;
    }
    cursor.finishWrap();
    await placeQueued(false);
    cursor.finishWrap();
    await drawBlock(doc, cursor, theme, block, fonts, photoByPath, false);
  }

  cursor.finishWrap();
  await placeQueued(false);
  cursor.finishWrap();
  cursor.setPerson(null);
}

async function drawPersonHeading(
  cursor: PdfCursor,
  theme: CapsuleTheme,
  name: string,
  rest: LetterBlock[],
  fonts: CapsulePdfFonts,
  person: string,
) {
  const headingSize = headingSizeForTheme(theme);
  const firstText = rest.find((block) => block.kind === "text");
  const firstIsWeave = rest[0]?.kind === "photo" && rest[0].variant === "weave";
  const hasPhoto = rest.some((block) => block.kind === "photo" || block.kind === "gallery");
  const insetWidth = sideTextColumnWidth();
  const narrowHeight = firstText
    ? estimateWrappedHeight(
        firstText.text,
        fonts.serif,
        fonts.emoji,
        PDF_BODY_SIZE,
        PDF_BODY_LINE_GAP,
        firstIsWeave ? insetWidth : CONTENT_WIDTH,
      )
    : 0;
  const photoHeight = firstIsWeave ? clampSidePhotoHeight(narrowHeight || PDF_SIDE_PHOTO_MIN) : 0;
  const firstTextHeight = firstText
    ? firstIsWeave
      ? measureTextBesidePhoto({
          text: firstText.text,
          font: fonts.serif,
          emoji: fonts.emoji,
          size: PDF_BODY_SIZE,
          lineGap: PDF_BODY_LINE_GAP,
          insetWidth,
          fullWidth: CONTENT_WIDTH,
          photoHeight,
        })
      : estimateWrappedHeight(
          firstText.text,
          fonts.serif,
          fonts.emoji,
          PDF_BODY_SIZE,
          PDF_BODY_LINE_GAP,
          CONTENT_WIDTH,
        )
    : hasPhoto
      ? PDF_PHOTO_SHRINK_MIN
      : 0;
  const needed = headingKeepWithNextNeeded({
    headingSize,
    headingGap: PDF_HEADING_GAP,
    firstTextHeight,
    photoHeight,
  });
  cursor.ensure(needed);
  cursor.record({ kind: "heading", name, person, page: cursor.pageIndex, y: cursor.y });
  cursor.text(name, {
    font: fonts.serifBold,
    size: headingSize,
    color: cursor.palette.ink,
    gap: PDF_HEADING_GAP,
    center: theme === "minimal" || theme === "heritage",
  });
}

function drawLetterText(
  cursor: PdfCursor,
  fonts: CapsulePdfFonts,
  text: string,
  person: string,
) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    cursor.wrapped(line || " ", {
      font: fonts.serif,
      size: PDF_BODY_SIZE,
      lineGap: PDF_BODY_LINE_GAP,
      color: cursor.palette.ink,
      center: false,
    });
  }
  cursor.advanceParagraphGap(PDF_PARAGRAPH_GAP);
}

async function placeWeavePhoto(
  doc: PDFDocument,
  cursor: PdfCursor,
  block: Extract<LetterBlock, { kind: "photo"; variant: "weave" }>,
  fonts: CapsulePdfFonts,
  photoByPath: Map<string, Uint8Array>,
  pairedText: string,
  inset: boolean,
) {
  const image = await embedPhoto(doc, photoByPath.get(block.photo.storage_path));
  if (!image) return;
  const textH = pairedText
    ? estimateWrappedHeight(
        pairedText,
        fonts.serif,
        fonts.emoji,
        PDF_BODY_SIZE,
        PDF_BODY_LINE_GAP,
        sideTextColumnWidth(),
      )
    : PDF_SIDE_PHOTO_MIN;
  const maxH = clampSidePhotoHeight(textH);
  if (inset) {
    cursor.insetImage(image, block.side, maxH, block.photo.storage_path);
    return;
  }
  await cursor.leftoverJustified([{ image, storage_path: block.photo.storage_path }], {
    maxH: PDF_LEFTOVER_MAX_H,
    gap: PDF_LEFTOVER_GAP,
  });
}

async function drawBlock(
  doc: PDFDocument,
  cursor: PdfCursor,
  theme: CapsuleTheme,
  block: LetterBlock,
  fonts: CapsulePdfFonts,
  photoByPath: Map<string, Uint8Array>,
  weaveBeside = false,
) {
  if (block.kind === "heading") {
    cursor.finishWrap();
    const center = theme === "minimal" || theme === "heritage";
    cursor.text(block.name, {
      font: fonts.serifBold,
      size: theme === "heritage" ? 16 : 18,
      color: cursor.palette.ink,
      gap: 12,
      center,
    });
    return;
  }
  if (block.kind === "text") {
    for (const line of block.text.replace(/\r\n/g, "\n").split("\n")) {
      cursor.wrapped(line || " ", {
        font: fonts.serif,
        size: 12,
        lineGap: 4,
        color: cursor.palette.ink,
        center: false,
      });
    }
    cursor.y -= 8;
    return;
  }
  if (block.kind === "gallery") {
    const maxH = block.variant === "strip" ? PDF_LEFTOVER_STRIP_MAX_H : PDF_LEFTOVER_MAX_H;
    await cursor.gallery(doc, block.photos, photoByPath, { maxH, gap: PDF_LEFTOVER_GAP });
    return;
  }

  const image = await embedPhoto(doc, photoByPath.get(block.photo.storage_path));
  if (!image) return;
  if (block.variant === "plate") {
    await cursor.plate(image, plateLabel(block.plateIndex ?? 0), fonts.serifItalic);
    return;
  }
  if (weaveBeside) {
    cursor.insetImage(image, block.side, 210);
    return;
  }
  await cursor.image(image, 300);
}

async function drawMagazineIssue(
  doc: PDFDocument,
  input: {
    archive: CapsuleArchive;
    fonts: CapsulePdfFonts;
    palette: PdfPalette;
    photoByPath: Map<string, Uint8Array>;
    title: string;
    groupName: string;
    layout?: CapsulePdfLayoutEvent[];
  },
) {
  const display = await embedMagazineDisplayFont(doc);
  const cursor = new PdfCursor(
    doc,
    input.palette,
    input.fonts.emoji,
    PAGE_HEIGHT - MARGIN,
    input.layout,
    {
      footerTitle: input.groupName,
      footerFont: input.fonts.sans,
      contentBottom: MAGAZINE_CONTENT_BOTTOM,
    },
  );
  const coverPhotos = magazineCoverPhotos(input.archive.letters);
  await drawMagazineCover(doc, cursor, input.fonts, display, {
    groupName: input.groupName,
    title: input.title,
    letters: input.archive.letters,
    photoByPath: input.photoByPath,
    coverPhotos,
  });

  if (input.archive.letters.length === 0) {
    cursor.forceNewPage();
    cursor.wrapped("No letters this month.", {
      font: input.fonts.serifItalic,
      size: 13,
      lineGap: 4,
      color: input.palette.muted,
    });
  } else {
    for (const [index, letter] of input.archive.letters.entries()) {
      const startH = magazinePersonStartHeight(letter, input.fonts, sortedLetterPhotos(letter));
      if (index === 0) {
        cursor.forceNewPage();
      } else if (cursor.remaining() >= startH + 16) {
        cursor.finishWrap();
        cursor.rule(16);
      } else {
        cursor.forceNewPage();
      }
      const last = index === input.archive.letters.length - 1;
      await drawMagazinePerson(doc, cursor, letter, input.fonts, display, input.photoByPath, {
        reserveBottom: last ? 24 : 0,
        featureSide: index % 2 === 0 ? "left" : "right",
      });
    }
  }

  cursor.finishWrap();
  if (cursor.remaining() >= 22) cursor.y -= 10;
  cursor.wrapped(missedCountPhrase(input.archive.missed_count), {
    font: input.fonts.sans,
    size: 10,
    lineGap: 3,
    color: input.palette.muted,
  });
}

async function drawMagazineCover(
  doc: PDFDocument,
  cursor: PdfCursor,
  fonts: CapsulePdfFonts,
  display: PdfTypeFace,
  input: {
    groupName: string;
    title: string;
    letters: readonly CapsuleArchiveLetter[];
    photoByPath: Map<string, Uint8Array>;
    coverPhotos: CapsuleArchivePhoto[];
  },
) {
  const artBottom = MAGAZINE_CONTENT_BOTTOM;
  const titleH = input.coverPhotos.length > 0 ? 248 : PAGE_HEIGHT - artBottom;
  const collageH = PAGE_HEIGHT - artBottom - titleH;
  if (input.coverPhotos.length > 0 && collageH > 80) {
    await drawMagazineCoverArt(
      doc,
      cursor,
      input.coverPhotos,
      input.photoByPath,
      0,
      artBottom + titleH,
      PAGE_WIDTH,
      collageH,
    );
  } else if (input.coverPhotos.length === 0) {
    cursor.page.drawRectangle({
      x: 0,
      y: artBottom,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT - artBottom,
      color: mixRgb(cursor.palette.accent, cursor.palette.paper, 0.82),
    });
  }

  cursor.page.drawRectangle({
    x: 0,
    y: artBottom,
    width: PAGE_WIDTH,
    height: titleH,
    color: cursor.palette.paper,
  });
  cursor.page.drawLine({
    start: { x: 0, y: artBottom + titleH },
    end: { x: PAGE_WIDTH, y: artBottom + titleH },
    thickness: 2,
    color: cursor.palette.accent,
  });

  cursor.y = artBottom + titleH - 36;
  cursor.wrapped(input.groupName.toUpperCase(), {
    font: display,
    size: MAGAZINE_COVER_SIZE,
    lineGap: 4,
    color: cursor.palette.ink,
    paragraphGap: 8,
  });
  cursor.wrapped(MAGAZINE_COVER_KICKER, {
    font: fonts.sans,
    size: 13,
    lineGap: 3,
    color: cursor.palette.accent,
    paragraphGap: 6,
  });
  cursor.wrapped(input.title, {
    font: fonts.sans,
    size: 14,
    lineGap: 3,
    color: cursor.palette.muted,
    paragraphGap: 16,
  });
  const names = contributorsLine(input.letters.map((letter) => letter.preferred_name));
  if (names) {
    const namesH = estimateWrappedHeight(names, fonts.sans, fonts.emoji, 11, 3, CONTENT_WIDTH);
    cursor.y = Math.min(cursor.y, MAGAZINE_CONTENT_BOTTOM + namesH + 18);
    cursor.wrapped(names, {
      font: fonts.sans,
      size: 11,
      lineGap: 3,
      color: cursor.palette.muted,
      paragraphGap: 6,
    });
  }
  cursor.y = MAGAZINE_CONTENT_BOTTOM;
}

async function drawMagazineCoverArt(
  doc: PDFDocument,
  cursor: PdfCursor,
  photos: CapsuleArchivePhoto[],
  photoByPath: Map<string, Uint8Array>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (photos.length === 0) {
    cursor.page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: mixRgb(cursor.palette.accent, cursor.palette.paper, 0.82),
    });
    return;
  }
  const cells = magazineCoverCells(photos.length, x, y, w, h);
  for (const [index, cell] of cells.entries()) {
    const photo = photos[index];
    if (!photo) continue;
    const bytes = photoByPath.get(photo.storage_path);
    if (!bytes) continue;
    const cropped = await cropJpegToAspect(bytes, cell.w / Math.max(1, cell.h));
    if (!cropped) continue;
    try {
      const image = await doc.embedJpg(cropped);
      cursor.page.drawImage(image, {
        x: cell.x,
        y: cell.y,
        width: cell.w,
        height: cell.h,
      });
      cursor.record({
        kind: "photo",
        storage_path: photo.storage_path,
        page: cursor.pageIndex,
        x: cell.x,
        y: cell.y + cell.h,
        width: cell.w,
        bottom: cell.y,
        height: cell.h,
      });
    } catch {
      // skip a broken cover cell rather than leave a hole in the panel
    }
  }
}

function magazineBodySize(body: string): number {
  return magazineUsesTwoTextColumns(body) ? MAGAZINE_BODY_SIZE_DENSE : MAGAZINE_BODY_SIZE;
}

function magazineFeatureHeight(plan: ReturnType<typeof planMagazinePerson>): number {
  if (plan.hero) {
    const aspect = magazineHeroAspect(plan.hero.width, plan.hero.height) ?? MAGAZINE_HERO_16_9;
    return Math.min(CONTENT_WIDTH / aspect, MAGAZINE_FEATURE_MAX_H);
  }
  if (plan.columnPhoto) {
    const colW = CONTENT_WIDTH * MAGAZINE_SIDE_FRACTION;
    return Math.min(colW * (plan.columnPhoto.height / Math.max(1, plan.columnPhoto.width)), MAGAZINE_FEATURE_MAX_H);
  }
  return 0;
}

function magazineMinFeatureHeight(plan: ReturnType<typeof planMagazinePerson>): number {
  if (plan.hero) return MAGAZINE_PHOTO_MIN_SHORT;
  if (plan.columnPhoto) {
    const aspect = plan.columnPhoto.width / Math.max(1, plan.columnPhoto.height);
    return MAGAZINE_PHOTO_MIN_SHORT / Math.min(aspect, 1);
  }
  return 0;
}

function magazinePersonStartHeight(
  letter: CapsuleArchiveLetter,
  fonts: CapsulePdfFonts,
  photos: CapsuleArchivePhoto[],
): number {
  const paragraphs = letterParagraphs(letter.body);
  const first = paragraphs[0] ?? "";
  const size = magazineBodySize(letter.body);
  const plan = planMagazinePerson(photos);
  const insetW = plan.columnPhoto
    ? CONTENT_WIDTH - CONTENT_WIDTH * MAGAZINE_SIDE_FRACTION - PDF_SIDE_PHOTO_GUTTER
    : CONTENT_WIDTH;
  const textH = first
    ? estimateWrappedHeight(first, fonts.serif, fonts.emoji, size, MAGAZINE_BODY_LINE_GAP, insetW)
    : 0;
  const nameH = MAGAZINE_NAME_SIZE + PDF_HEADING_GAP + 12;
  const featureH = magazineMinFeatureHeight(plan);
  if (plan.hero) return nameH + featureH + Math.min(textH, 64) + 16;
  return nameH + Math.max(Math.min(textH, 64), featureH) + 16;
}

async function drawMagazinePerson(
  doc: PDFDocument,
  cursor: PdfCursor,
  letter: CapsuleArchiveLetter,
  fonts: CapsulePdfFonts,
  display: PdfTypeFace,
  photoByPath: Map<string, Uint8Array>,
  opts: { reserveBottom?: number; featureSide?: "left" | "right" } = {},
) {
  const photos = sortedLetterPhotos(letter);
  const paragraphs = letterParagraphs(letter.body);
  const plan = planMagazinePerson(photos);
  const bodySize = magazineBodySize(letter.body);
  const useTwoCol = magazineUsesTwoTextColumns(letter.body);
  const reserved = Math.max(0, opts.reserveBottom ?? 0);
  const featureSide = opts.featureSide ?? "left";
  cursor.finishWrap();
  cursor.setPerson(letter.preferred_name);

  const firstText = paragraphs[0] ?? "";
  const insetW = plan.columnPhoto
    ? CONTENT_WIDTH - CONTENT_WIDTH * MAGAZINE_SIDE_FRACTION - PDF_SIDE_PHOTO_GUTTER
    : CONTENT_WIDTH;
  const firstTextHeight = firstText
    ? estimateWrappedHeight(firstText, fonts.serif, fonts.emoji, bodySize, MAGAZINE_BODY_LINE_GAP, insetW)
    : 0;
  const placed = new Set<string>();
  const keepFeature = Math.min(
    magazineFeatureHeight(plan),
    Math.max(
      magazineMinFeatureHeight(plan),
      cursor.remaining() - MAGAZINE_NAME_SIZE - PDF_HEADING_GAP - Math.min(firstTextHeight, 72) - 24,
    ),
  );

  drawMagazineName(cursor, letter.preferred_name, display, Math.min(firstTextHeight, 72), keepFeature);

  const extraCount = photos.length - (plan.hero || plan.columnPhoto ? 1 : 0);
  const reserveGrid = extraCount > 0 ? MAGAZINE_PHOTO_MIN_SHORT + 80 : 0;
  const restTextH = paragraphs.slice(plan.hero ? 0 : 1).reduce((sum, paragraph) => {
    return (
      sum +
      estimateWrappedHeight(paragraph, fonts.serif, fonts.emoji, bodySize, MAGAZINE_BODY_LINE_GAP, CONTENT_WIDTH) +
      PDF_PARAGRAPH_GAP
    );
  }, 0);
  if (plan.hero) {
    const heroBudget = Math.min(
      magazineFeatureHeight(plan),
      Math.max(MAGAZINE_PHOTO_MIN_SHORT, cursor.remaining() - reserved - reserveGrid - restTextH - 16),
    );
    if (await drawMagazineHero(doc, cursor, plan.hero, photoByPath, heroBudget)) {
      placed.add(plan.hero.storage_path);
    }
  } else if (plan.columnPhoto) {
    const drawn = await drawMagazineFeaturePortrait(
      doc,
      cursor,
      plan.columnPhoto,
      photoByPath,
      featureSide,
      reserveGrid,
    );
    if (drawn) placed.add(plan.columnPhoto.storage_path);
  }

  if (useTwoCol) {
    if (firstText && cursor.hasActiveWrap()) {
      drawMagazineLetterText(cursor, fonts, firstText, letter.preferred_name, bodySize);
      cursor.finishWrap();
      const rest = paragraphs.slice(1);
      if (rest.length > 0) drawMagazineTwoColParagraphs(cursor, fonts, rest, letter.preferred_name, reserved);
    } else {
      cursor.finishWrap();
      drawMagazineTwoColParagraphs(cursor, fonts, paragraphs, letter.preferred_name, reserved);
    }
  } else {
    for (const paragraph of paragraphs) {
      drawMagazineLetterText(cursor, fonts, paragraph, letter.preferred_name, bodySize);
    }
    cursor.finishWrap();
  }

  const unplaced = photos.filter((photo) => !placed.has(photo.storage_path));
  if (unplaced.length > 0) {
    cursor.finishWrap();
    await drawMagazineEndGrid(doc, cursor, unplaced, photoByPath, fonts, letter.preferred_name, reserved);
  }

  cursor.finishWrap();
  cursor.setPerson(null);
}

function drawMagazineName(
  cursor: PdfCursor,
  name: string,
  display: PdfTypeFace,
  firstTextHeight: number,
  photoHeight = 0,
) {
  const needed = headingKeepWithNextNeeded({
    headingSize: MAGAZINE_NAME_SIZE,
    headingGap: PDF_HEADING_GAP,
    firstTextHeight,
    photoHeight,
    pageContentHeight: PDF_PAGE_HEIGHT - MARGIN - MAGAZINE_CONTENT_BOTTOM,
  });
  cursor.ensure(needed);
  cursor.record({ kind: "heading", name, person: name, page: cursor.pageIndex, y: cursor.y });
  cursor.text(name.toUpperCase(), {
    font: display,
    size: MAGAZINE_NAME_SIZE,
    color: cursor.palette.accent,
    gap: 6,
  });
  const ruleW = Math.min(CONTENT_WIDTH, 92);
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y + 2 },
    end: { x: MARGIN + ruleW, y: cursor.y + 2 },
    thickness: 1.25,
    color: cursor.palette.accent,
  });
  cursor.y -= 10;
}

function drawMagazineLetterText(
  cursor: PdfCursor,
  fonts: CapsulePdfFonts,
  text: string,
  person: string,
  size: number,
) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    cursor.wrapped(line || " ", {
      font: fonts.serif,
      size,
      lineGap: MAGAZINE_BODY_LINE_GAP,
      color: cursor.palette.ink,
      center: false,
    });
  }
  cursor.advanceParagraphGap(PDF_PARAGRAPH_GAP);
}

function drawMagazineTwoColParagraphs(
  cursor: PdfCursor,
  fonts: CapsulePdfFonts,
  paragraphs: string[],
  person: string,
  leaveBottom = 0,
) {
  cursor.finishWrap();
  const size = MAGAZINE_BODY_SIZE_DENSE;
  const lineGap = MAGAZINE_BODY_LINE_GAP;
  const gutter = MAGAZINE_TWO_COL_GUTTER;
  const colW = (CONTENT_WIDTH - gutter) / 2;
  const step = size + lineGap;
  const boxH = pdfLineBoxHeight(fonts.serif, size);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    for (const raw of paragraph.replace(/\r\n/g, "\n").split("\n")) {
      let remaining = (raw || " ").split(/\s+/).filter(Boolean);
      if (remaining.length === 0) remaining = [""];
      while (remaining.length > 0) {
        const taken = takeLine(remaining, fonts.serif, fonts.emoji, size, colW);
        lines.push(taken.line);
        remaining = taken.rest;
      }
    }
    if (lines.length > 0) lines.push("");
  }
  while (lines[lines.length - 1] === "") lines.pop();

  let index = 0;
  while (index < lines.length) {
    let perCol = Math.floor(Math.max(0, cursor.remaining() - leaveBottom - 4) / step);
    if (perCol < 2) {
      cursor.forceNewPage();
      perCol = Math.floor(Math.max(0, cursor.remaining() - leaveBottom - 4) / step);
    }
    const capacity = Math.max(2, perCol * 2);
    const chunk = lines.slice(index, index + capacity);
    const split = Math.ceil(chunk.length / 2);
    const columns = [chunk.slice(0, split), chunk.slice(split)];
    const top = cursor.y;
    const xs = [MARGIN, MARGIN + colW + gutter];
    let used = 0;
    columns.forEach((colLines, col) => {
      let y = top;
      for (const line of colLines) {
        if (line) {
          const width = widthOfPdfText(line, size, fonts.serif, fonts.emoji);
          cursor.record({
            kind: "text",
            person,
            text: line,
            page: cursor.pageIndex,
            x: xs[col],
            y,
            width,
            height: boxH,
            bottom: y - boxH,
          });
          drawPdfRuns(
            cursor.page,
            layoutPdfRuns(line, fonts.serif, fonts.emoji),
            xs[col]!,
            y - size,
            size,
            cursor.palette.ink,
          );
        }
        y -= step;
      }
      used = Math.max(used, top - y);
    });
    cursor.y = top - used;
    index += chunk.length;
  }
  cursor.advanceParagraphGap(PDF_PARAGRAPH_GAP);
}

async function drawMagazineFeaturePortrait(
  doc: PDFDocument,
  cursor: PdfCursor,
  photo: CapsuleArchivePhoto,
  photoByPath: Map<string, Uint8Array>,
  side: "left" | "right",
  reserveBottom = 0,
): Promise<boolean> {
  const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
  if (!image) return false;
  const colW = CONTENT_WIDTH * MAGAZINE_SIDE_FRACTION;
  const nativeH = colW * (image.height / Math.max(1, image.width));
  const photoH = Math.min(nativeH, cursor.remaining() - 16 - reserveBottom, MAGAZINE_FEATURE_MAX_H);
  const photoW = photoH * (image.width / image.height);
  if (Math.min(photoW, photoH) + 0.05 < MAGAZINE_PHOTO_MIN_SHORT) return false;
  if (cursor.y - photoH < cursor.contentBottom()) return false;
  const x = side === "right" ? PAGE_WIDTH - MARGIN - photoW : MARGIN;
  cursor.drawPlacedImage(image, x, cursor.y, photoW, photoH, photo.storage_path);
  cursor.startWrapRegion(side, photoW, photoH);
  return true;
}

async function drawMagazineHero(
  doc: PDFDocument,
  cursor: PdfCursor,
  photo: CapsuleArchivePhoto,
  photoByPath: Map<string, Uint8Array>,
  maxHeight = MAGAZINE_FEATURE_MAX_H,
): Promise<boolean> {
  const bytes = photoByPath.get(photo.storage_path);
  if (!bytes) return false;
  if (isPortraitPhoto(photo)) return false;
  const aspect = magazineHeroAspect(photo.width, photo.height);
  if (aspect == null) return false;
  const cropped = await cropJpegToAspect(bytes, aspect);
  if (!cropped) return false;
  try {
    const image = await doc.embedJpg(cropped);
    const naturalW = CONTENT_WIDTH;
    const naturalH = naturalW * (image.height / Math.max(1, image.width));
    const scale = Math.min(1, maxHeight / Math.max(1, naturalH));
    const drawW = naturalW * scale;
    const drawH = naturalH * scale;
    if (drawH + 16 > cursor.remaining()) {
      const fit = Math.max(MAGAZINE_PHOTO_MIN_SHORT, cursor.remaining() - 20);
      const fitted = Math.min(drawH, fit);
      const fittedW = fitted * (drawW / drawH);
      if (Math.min(fittedW, fitted) + 0.05 < MAGAZINE_PHOTO_MIN_SHORT) return false;
      cursor.y -= fitted;
      const x = MARGIN + Math.max(0, (CONTENT_WIDTH - fittedW) / 2);
      cursor.page.drawImage(image, { x, y: cursor.y, width: fittedW, height: fitted });
      cursor.record({
        kind: "photo",
        person: cursor.currentPerson() ?? undefined,
        storage_path: photo.storage_path,
        page: cursor.pageIndex,
        x,
        y: cursor.y + fitted,
        width: fittedW,
        bottom: cursor.y,
        height: fitted,
      });
      cursor.y -= 12;
      return true;
    }
    cursor.y -= drawH;
    const x = MARGIN + Math.max(0, (CONTENT_WIDTH - drawW) / 2);
    cursor.page.drawImage(image, { x, y: cursor.y, width: drawW, height: drawH });
    cursor.record({
      kind: "photo",
      person: cursor.currentPerson() ?? undefined,
      storage_path: photo.storage_path,
      page: cursor.pageIndex,
      x,
      y: cursor.y + drawH,
      width: drawW,
      bottom: cursor.y,
      height: drawH,
    });
    cursor.y -= 12;
    return true;
  } catch {
    return false;
  }
}

async function drawMagazineSideStack(
  doc: PDFDocument,
  cursor: PdfCursor,
  photos: CapsuleArchivePhoto[],
  photoByPath: Map<string, Uint8Array>,
  maxStackH?: number,
): Promise<{ placed: string[]; leftover: CapsuleArchivePhoto[] }> {
  const items: Array<{ image: PDFImage; photo: CapsuleArchivePhoto; w: number; h: number }> = [];
  const colW = CONTENT_WIDTH * MAGAZINE_SIDE_FRACTION;
  for (const photo of photos) {
    const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
    if (!image) continue;
    const w = colW;
    const h = w * (image.height / Math.max(1, image.width));
    items.push({ image, photo, w, h });
  }
  if (items.length === 0) return { placed: [], leftover: [...photos] };
  const gap = PDF_LEFTOVER_GAP;
  const budget = Math.max(
    MAGAZINE_PHOTO_MIN_SHORT,
    Math.min(maxStackH ?? Number.POSITIVE_INFINITY, cursor.remaining() - 8),
  );
  let take = items.length;
  let heights: number[] = [];
  let total = 0;
  while (take > 0) {
    const slice = items.slice(0, take);
    heights = slice.map((item) => item.h);
    total = heights.reduce((sum, height) => sum + height, 0) + gap * (slice.length - 1);
    if (total > budget) {
      const scale = budget / total;
      heights = heights.map((height) => height * scale);
      total = budget;
    }
    const shorts = slice.map((item, index) => Math.min(heights[index]! * (item.w / item.h), heights[index]!));
    if (shorts.every((side) => side + 0.05 >= MAGAZINE_PHOTO_MIN_SHORT)) break;
    take -= 1;
  }
  if (take === 0) return { placed: [], leftover: items.map((item) => item.photo) };
  const x = PAGE_WIDTH - MARGIN - colW;
  let top = cursor.y;
  const placed: string[] = [];
  items.slice(0, take).forEach((item, index) => {
    const h = heights[index]!;
    const w = h * (item.w / item.h);
    cursor.drawPlacedImage(item.image, x + (colW - w), top, w, h, item.photo.storage_path);
    placed.push(item.photo.storage_path);
    top -= h + gap;
  });
  cursor.startWrapRegion("right", colW, total);
  return { placed, leftover: items.slice(take).map((item) => item.photo) };
}

async function drawMagazineInterleaved(
  doc: PDFDocument,
  cursor: PdfCursor,
  fonts: CapsulePdfFonts,
  paragraphs: string[],
  photos: CapsuleArchivePhoto[],
  photoByPath: Map<string, Uint8Array>,
  person: string,
  opts: { bodySize: number; rowH: number; useTwoCol: boolean; leaveBottom?: number },
): Promise<string[]> {
  const pending = [...photos];
  const paras = [...paragraphs];
  const drawn: string[] = [];
  const takeDrawn = (paths: string[]) => {
    for (const path of paths) {
      drawn.push(path);
      const index = pending.findIndex((photo) => photo.storage_path === path);
      if (index >= 0) pending.splice(index, 1);
    }
  };
  if (opts.useTwoCol && paras.length > 0 && !cursor.hasActiveWrap()) {
    if (pending.length >= 2) {
      cursor.finishWrap();
      takeDrawn(await drawMagazinePhotoRow(doc, cursor, pending.slice(0, 2), photoByPath, opts.rowH));
    }
    drawMagazineTwoColParagraphs(cursor, fonts, paras.splice(0), person, opts.leaveBottom ?? 0);
    return drawn;
  }
  if (paras.length > 0) {
    drawMagazineLetterText(cursor, fonts, paras.shift()!, person, opts.bodySize);
  }
  while (paras.length > 0) {
    if (pending.length >= 2) {
      cursor.finishWrap();
      takeDrawn(await drawMagazinePhotoRow(doc, cursor, pending.slice(0, 2), photoByPath, opts.rowH));
    } else if (pending.length === 1) {
      const photo = pending[0]!;
      const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
      cursor.finishWrap();
      if (image && magazineInsetFitsMinShort(image, opts.rowH, cursor.remaining())) {
        const maxH = Math.max(MAGAZINE_PHOTO_MIN_SHORT, Math.min(opts.rowH + 36, PDF_SIDE_PHOTO_MAX));
        cursor.insetImage(image, "right", maxH, photo.storage_path);
        takeDrawn([photo.storage_path]);
      }
    }
    if (opts.useTwoCol && paras.length > 1 && !cursor.hasActiveWrap()) {
      drawMagazineTwoColParagraphs(cursor, fonts, paras.splice(0), person, opts.leaveBottom ?? 0);
    } else {
      drawMagazineLetterText(cursor, fonts, paras.shift()!, person, opts.bodySize);
    }
    cursor.finishWrap();
  }
  return drawn;
}

function magazineInsetFitsMinShort(image: PDFImage, maxH: number, remaining: number): boolean {
  const maxW = CONTENT_WIDTH * PDF_SIDE_PHOTO_FRACTION;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  if (Math.min(width, height) + 0.05 < MAGAZINE_PHOTO_MIN_SHORT) return false;
  const shrink = shrinkSidePhotoToRemaining(height, remaining);
  if (shrink.pageBreak) return false;
  const nextH = shrink.height;
  const nextW = width * (nextH / Math.max(1, height));
  return Math.min(nextW, nextH) + 0.05 >= MAGAZINE_PHOTO_MIN_SHORT;
}

async function drawMagazinePhotoRow(
  doc: PDFDocument,
  cursor: PdfCursor,
  photos: CapsuleArchivePhoto[],
  photoByPath: Map<string, Uint8Array>,
  maxH: number,
): Promise<string[]> {
  const items: Array<{ image: PDFImage; storage_path: string }> = [];
  for (const photo of photos) {
    const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
    if (image) items.push({ image, storage_path: photo.storage_path });
  }
  if (items.length === 0) return [];
  const aspects = items.map((entry) => entry.image.width / Math.max(1, entry.image.height));
  const count = magazineRowCountForMinShort(aspects, CONTENT_WIDTH, PDF_LEFTOVER_GAP);
  const rowItems = items.slice(0, count);
  const rowAspects = aspects.slice(0, count);
  const minH = magazineMinRowHeight(rowAspects);
  if (cursor.remaining() < minH + 12) return [];
  const fitH = Math.min(maxH, Math.max(minH, cursor.remaining() - 10));
  let row = justifiedRowMetrics(rowAspects, CONTENT_WIDTH, PDF_LEFTOVER_GAP, fitH);
  const shorts = row.widths.map((width) => Math.min(width, row.height));
  if (shorts.some((side) => side + 0.05 < MAGAZINE_PHOTO_MIN_SHORT)) {
    row = justifiedRowMetrics(rowAspects, CONTENT_WIDTH, PDF_LEFTOVER_GAP, minH);
    if (row.height + 8 > cursor.remaining()) return [];
  }
  return drawMagazineJustifiedRow(cursor, rowItems, row);
}

function drawMagazineJustifiedRow(
  cursor: PdfCursor,
  items: Array<{ image: PDFImage; storage_path: string }>,
  row: { height: number; widths: number[]; usedWidth: number },
): string[] {
  if (items.length === 0 || row.height < 8) return [];
  const shorts = row.widths.map((width) => Math.min(width, row.height));
  if (shorts.some((side) => side + 0.05 < MAGAZINE_PHOTO_MIN_SHORT)) return [];
  if (row.height + 4 > cursor.remaining()) return [];
  cursor.y -= row.height;
  let x = MARGIN + Math.max(0, (CONTENT_WIDTH - row.usedWidth) / 2);
  items.forEach((entry, index) => {
    const w = row.widths[index]!;
    cursor.page.drawImage(entry.image, {
      x,
      y: cursor.y,
      width: w,
      height: row.height,
    });
    cursor.record({
      kind: "photo",
      person: cursor.currentPerson() ?? undefined,
      page: cursor.pageIndex,
      x,
      y: cursor.y + row.height,
      width: w,
      bottom: cursor.y,
      height: row.height,
      storage_path: entry.storage_path,
    });
    x += w + PDF_LEFTOVER_GAP;
  });
  cursor.y -= 10;
  return items.map((entry) => entry.storage_path);
}

function magazineFillRow(
  items: Array<{ image: PDFImage; storage_path: string }>,
  leftover: number,
): { items: Array<{ image: PDFImage; storage_path: string }>; row: { height: number; widths: number[]; usedWidth: number } } | null {
  if (items.length === 0 || leftover < MAGAZINE_PHOTO_MIN_SHORT + 6) return null;
  const aspects = items.map((entry) => entry.image.width / Math.max(1, entry.image.height));
  let count = magazineRowCountForMinShort(aspects, CONTENT_WIDTH, PDF_LEFTOVER_GAP, MAGAZINE_PHOTO_MIN_SHORT);
  if (leftover > MAGAZINE_PHOTO_ROW_H + MAGAZINE_PHOTO_MIN_SHORT + 24 && items.length >= 2) {
    count = Math.min(count, items.length === 2 ? 1 : 2);
  }
  while (count >= 1) {
    const slice = items.slice(0, count);
    const sliceAspects = aspects.slice(0, count);
    const budget = Math.min(MAGAZINE_PHOTO_ROW_H, leftover - 8);
    const row = justifiedRowMetrics(sliceAspects, CONTENT_WIDTH, PDF_LEFTOVER_GAP, budget);
    const shorts = row.widths.map((width) => Math.min(width, row.height));
    if (row.height + 6 <= leftover && shorts.every((side) => side + 0.05 >= MAGAZINE_PHOTO_MIN_SHORT)) {
      return { items: slice, row };
    }
    count -= 1;
  }
  return null;
}

async function drawMagazineEndGrid(
  doc: PDFDocument,
  cursor: PdfCursor,
  photos: CapsuleArchivePhoto[],
  photoByPath: Map<string, Uint8Array>,
  fonts: CapsulePdfFonts,
  person: string,
  leaveBottom = 0,
) {
  const items: Array<{ image: PDFImage; storage_path: string }> = [];
  for (const photo of photos) {
    const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
    if (image) items.push({ image, storage_path: photo.storage_path });
  }
  let offset = 0;
  const labelOverflowPage = () => {
    cursor.wrapped(person, {
      font: fonts.sans,
      size: 11,
      lineGap: 3,
      color: cursor.palette.accent,
      paragraphGap: 8,
    });
  };
  while (offset < items.length) {
    const left = items.slice(offset);
    const aspects = left.map((entry) => entry.image.width / Math.max(1, entry.image.height));
    const leftover = cursor.remaining() - leaveBottom;
    const fitted = magazineFillRow(left, leftover);
    if (!fitted) {
      cursor.forceNewPage();
      labelOverflowPage();
      continue;
    }
    const drawn = drawMagazineJustifiedRow(cursor, fitted.items, fitted.row);
    if (drawn.length === 0) {
      cursor.forceNewPage();
      labelOverflowPage();
      continue;
    }
    offset += drawn.length;
  }
}

async function embedPhoto(doc: PDFDocument, bytes: Uint8Array | undefined): Promise<PDFImage | null> {
  if (!bytes) return null;
  const jpeg = await preparePdfJpeg(bytes);
  if (!jpeg) return null;
  try {
    return await doc.embedJpg(jpeg);
  } catch {
    return null;
  }
}

type PdfWrap = { side: "left" | "right"; top: number; bottom: number; width: number };

type PdfCursorChrome = {
  footerTitle?: string;
  footerFont?: PdfTypeFace;
  contentBottom?: number;
};

class PdfCursor {
  page: PDFPage;
  y: number;
  pageIndex = 1;
  private wrap: PdfWrap | null = null;
  private person: string | null = null;

  constructor(
    private readonly doc: PDFDocument,
    readonly palette: PdfPalette,
    private readonly emoji: PdfTypeFace,
    y: number,
    private readonly layout: CapsulePdfLayoutEvent[] | undefined = undefined,
    private readonly chrome: PdfCursorChrome | undefined = undefined,
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = y;
    this.paintPage();
    this.record({ kind: "page", page: this.pageIndex, y: this.y });
  }

  setPerson(name: string | null) {
    this.person = name;
  }

  currentPerson(): string | null {
    return this.person;
  }

  contentBottom(): number {
    return this.chrome?.contentBottom ?? MARGIN;
  }

  remaining(): number {
    return this.y - this.contentBottom();
  }

  record(event: CapsulePdfLayoutEvent) {
    this.layout?.push(event);
  }

  hasActiveWrap(): boolean {
    return Boolean(this.wrap && this.y > this.wrap.bottom - PDF_WRAP_CLEAR_GAP);
  }

  advanceParagraphGap(gap: number) {
    if (gap <= 0) return;
    this.y -= gap;
  }

  ensure(needed: number) {
    if (this.y - needed >= this.contentBottom()) return;
    this.forceNewPage();
  }

  forceNewPage() {
    this.wrap = null;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageIndex += 1;
    this.paintPage();
    this.y = PAGE_HEIGHT - MARGIN;
    this.record({ kind: "page", page: this.pageIndex, y: this.y });
  }

  startWrapRegion(side: "left" | "right", width: number, height: number) {
    this.finishWrap();
    this.wrap = { side, top: this.y, bottom: this.y - height, width };
  }

  drawPlacedImage(
    image: PDFImage,
    x: number,
    top: number,
    width: number,
    height: number,
    storagePath?: string,
  ) {
    this.page.drawImage(image, {
      x,
      y: top - height,
      width,
      height,
    });
    this.record({
      kind: "photo",
      person: this.person ?? undefined,
      storage_path: storagePath,
      page: this.pageIndex,
      x,
      y: top,
      width,
      bottom: top - height,
      height,
    });
  }

  finishWrap(gap = 10) {
    if (!this.wrap) return;
    if (this.y > this.wrap.bottom) this.y = this.wrap.bottom;
    this.y -= gap;
    this.wrap = null;
  }

  column(lineBoxHeight: number): { x: number; width: number } {
    if (!this.wrap || !lineBoxOverlapsWrap(this.y, lineBoxHeight, this.wrap.bottom)) {
      return { x: MARGIN, width: CONTENT_WIDTH };
    }
    const taken = this.wrap.width + PDF_SIDE_PHOTO_GUTTER;
    if (this.wrap.side === "right") {
      return { x: MARGIN, width: CONTENT_WIDTH - taken };
    }
    return { x: MARGIN + taken, width: CONTENT_WIDTH - taken };
  }

  paintPage() {
    this.page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: this.palette.paper,
    });
    this.drawMagazineFooter();
  }

  private drawMagazineFooter() {
    const title = this.chrome?.footerTitle;
    const font = this.chrome?.footerFont;
    if (!title || !font) return;
    const height = MAGAZINE_FOOTER_HEIGHT;
    this.page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height,
      color: this.palette.accent,
    });
    const size = 9;
    const padX = 18;
    const textY = (height - size) / 2 + 1;
    const pageLabel = String(this.pageIndex);
    const pageWidth = widthOfPdfText(pageLabel, size, font, this.emoji);
    const titleMax = PAGE_WIDTH - padX * 2 - pageWidth - 16;
    const fitted = fitPdfLabel(title, size, font, this.emoji, titleMax);
    drawPdfRuns(
      this.page,
      layoutPdfRuns(fitted, font, this.emoji),
      padX,
      textY,
      size,
      this.palette.paper,
    );
    drawPdfRuns(
      this.page,
      layoutPdfRuns(pageLabel, font, this.emoji),
      PAGE_WIDTH - padX - pageWidth,
      textY,
      size,
      this.palette.paper,
    );
    this.record({
      kind: "footer",
      page: this.pageIndex,
      y: height,
      text: title,
      name: pageLabel,
    });
  }

  text(
    value: string,
    opts: {
      font: PdfTypeFace;
      size: number;
      color: RGB;
      gap?: number;
      center?: boolean;
    },
  ) {
    this.ensure(opts.size + 6);
    const runs = layoutPdfRuns(value, opts.font, this.emoji);
    const width = widthOfPdfRuns(runs, opts.size);
    const x = opts.center ? MARGIN + Math.max(0, (CONTENT_WIDTH - width) / 2) : MARGIN;
    drawPdfRuns(this.page, runs, x, this.y - opts.size, opts.size, opts.color);
    this.y -= opts.size + (opts.gap ?? 0);
  }

  wrapped(
    value: string,
    opts: {
      font: PdfTypeFace;
      size: number;
      lineGap: number;
      color: RGB;
      paragraphGap?: number;
      center?: boolean;
    },
  ) {
    const words = value.split(/\s+/).filter(Boolean);
    let remaining = words.length > 0 ? words : [""];
    const lineBoxHeight = pdfLineBoxHeight(opts.font, opts.size);
    while (remaining.length > 0) {
      this.ensure(lineBoxHeight + opts.lineGap);
      const col = this.column(lineBoxHeight);
      const taken = takeLine(remaining, opts.font, this.emoji, opts.size, col.width);
      const width = widthOfPdfText(taken.line, opts.size, opts.font, this.emoji);
      const x = opts.center ? col.x + Math.max(0, (col.width - width) / 2) : col.x;
      this.record({
        kind: "text",
        person: this.person ?? undefined,
        text: taken.line,
        page: this.pageIndex,
        x,
        y: this.y,
        width,
        height: lineBoxHeight,
        bottom: this.y - lineBoxHeight,
      });
      drawPdfRuns(
        this.page,
        layoutPdfRuns(taken.line, opts.font, this.emoji),
        x,
        this.y - opts.size,
        opts.size,
        opts.color,
      );
      this.y -= opts.size + opts.lineGap;
      remaining = taken.rest;
    }
    if (opts.paragraphGap) this.advanceParagraphGap(opts.paragraphGap);
  }

  ribbon(value: string, font: PdfTypeFace) {
    const size = 10;
    const padX = 10;
    const padY = 5;
    const width = Math.min(CONTENT_WIDTH, widthOfPdfText(value, size, font, this.emoji) + padX * 2);
    const height = size + padY * 2;
    this.ensure(height + 12);
    this.y -= height;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width,
      height,
      color: this.palette.accent,
    });
    drawPdfRuns(
      this.page,
      layoutPdfRuns(value, font, this.emoji),
      MARGIN + padX,
      this.y + padY,
      size,
      this.palette.paper,
    );
    this.y -= 12;
  }

  rule(gapAfter = 20) {
    this.finishWrap();
    this.ensure(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 1,
      color: this.palette.rule,
    });
    this.y -= gapAfter;
  }

  letterRule(theme: CapsuleTheme) {
    this.y -= 6;
    this.rule(theme === "heritage" ? 18 : 20);
  }

  insetImage(image: PDFImage, side: "left" | "right", maxH: number, storagePath?: string) {
    if (this.wrap && this.y <= this.wrap.bottom) this.wrap = null;
    else if (this.wrap) this.finishWrap();
    const maxW = CONTENT_WIDTH * PDF_SIDE_PHOTO_FRACTION;
    const fit = (height: number) => {
      const scale = Math.min(maxW / image.width, height / image.height, 1);
      return { w: image.width * scale, h: image.height * scale };
    };
    let sized = fit(maxH);
    const remaining = this.remaining();
    const shrink = shrinkSidePhotoToRemaining(sized.h, remaining);
    if (shrink.pageBreak) {
      this.ensure(sized.h + PDF_PHOTO_ENSURE_PAD);
    } else if (shrink.height !== sized.h) {
      sized = fit(shrink.height);
    }
    if (this.y - sized.h < this.contentBottom()) this.ensure(sized.h + PDF_PHOTO_ENSURE_PAD);
    const x = side === "right" ? PAGE_WIDTH - MARGIN - sized.w : MARGIN;
    this.page.drawImage(image, {
      x,
      y: this.y - sized.h,
      width: sized.w,
      height: sized.h,
    });
    this.record({
      kind: "photo",
      person: this.person ?? undefined,
      storage_path: storagePath,
      page: this.pageIndex,
      x,
      y: this.y,
      width: sized.w,
      bottom: this.y - sized.h,
      height: sized.h,
    });
    this.wrap = { side, top: this.y, bottom: this.y - sized.h, width: sized.w };
  }

  async image(image: PDFImage, maxH: number, storagePath?: string) {
    this.finishWrap();
    const scale = Math.min(CONTENT_WIDTH / image.width, maxH / image.height, 1);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    this.ensure(drawH + 16);
    this.y -= drawH;
    this.page.drawImage(image, {
      x: MARGIN,
      y: this.y,
      width: drawW,
      height: drawH,
    });
    this.record({
      kind: "photo",
      person: this.person ?? undefined,
      storage_path: storagePath,
      page: this.pageIndex,
      x: MARGIN,
      y: this.y + drawH,
      width: drawW,
      bottom: this.y,
      height: drawH,
    });
    this.y -= 14;
  }

  async plate(image: PDFImage, caption: string, captionFont: PdfTypeFace) {
    this.finishWrap();
    const inset = 8;
    const scale = Math.min((CONTENT_WIDTH - inset * 2) / image.width, 260 / image.height, 1);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const boxW = drawW + inset * 2;
    const boxH = drawH + inset * 2;
    this.ensure(boxH + 28);
    this.y -= boxH;
    const x = MARGIN + (CONTENT_WIDTH - boxW) / 2;
    this.page.drawRectangle({
      x,
      y: this.y,
      width: boxW,
      height: boxH,
      borderColor: this.palette.accent,
      borderWidth: 1.25,
      color: this.palette.paper,
    });
    this.page.drawImage(image, {
      x: x + inset,
      y: this.y + inset,
      width: drawW,
      height: drawH,
    });
    this.record({
      kind: "photo",
      person: this.person ?? undefined,
      page: this.pageIndex,
      x: x + inset,
      y: this.y + inset + drawH,
      width: drawW,
      bottom: this.y + inset,
      height: drawH,
    });
    this.y -= 6;
    this.text(caption, {
      font: captionFont,
      size: 9,
      color: this.palette.muted,
      gap: 14,
      center: true,
    });
  }

  async leftoverJustified(
    items: Array<{ image: PDFImage; storage_path?: string }>,
    opts: { maxH: number; gap: number },
  ) {
    this.finishWrap();
    if (items.length === 0) return;
    const packs = packLeftoverRowCounts(items.length);
    let offset = 0;
    for (const count of packs) {
      const slice = items.slice(offset, offset + count);
      offset += count;
      const aspects = slice.map((entry) => entry.image.width / Math.max(1, entry.image.height));
      const row = justifiedRowMetrics(aspects, CONTENT_WIDTH, opts.gap, opts.maxH);
      this.ensure(row.height + 12);
      this.y -= row.height;
      let x = MARGIN + Math.max(0, (CONTENT_WIDTH - row.usedWidth) / 2);
      slice.forEach((entry, index) => {
        const w = row.widths[index]!;
        const h = row.height;
        this.page.drawImage(entry.image, {
          x,
          y: this.y,
          width: w,
          height: h,
        });
        this.record({
          kind: "photo",
          person: this.person ?? undefined,
          page: this.pageIndex,
          x,
          y: this.y + h,
          width: w,
          bottom: this.y,
          height: h,
          storage_path: entry.storage_path,
        });
        x += w + opts.gap;
      });
      this.y -= 12;
    }
  }

  async gallery(
    doc: PDFDocument,
    photos: readonly CapsuleArchivePhoto[],
    photoByPath: Map<string, Uint8Array>,
    opts: { maxH: number; gap: number },
  ) {
    const items: Array<{ image: PDFImage; storage_path?: string }> = [];
    for (const photo of photos) {
      const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
      if (image) items.push({ image, storage_path: photo.storage_path });
    }
    await this.leftoverJustified(items, opts);
  }
}

function fitPdfLabel(
  value: string,
  size: number,
  font: PdfTypeFace,
  emoji: PdfTypeFace,
  maxWidth: number,
): string {
  if (widthOfPdfText(value, size, font, emoji) <= maxWidth) return value;
  let current = value;
  while (current.length > 1 && widthOfPdfText(`${current}…`, size, font, emoji) > maxWidth) {
    current = current.slice(0, -1);
  }
  return current.length > 0 ? `${current}…` : value;
}

function takeLine(
  words: string[],
  font: PdfTypeFace,
  emoji: PdfTypeFace,
  size: number,
  maxWidth: number,
): { line: string; rest: string[] } {
  return takePdfLine(words, font, emoji, size, maxWidth);
}

function hexRgb(hex: string): RGB {
  const n = hex.replace("#", "");
  return rgb(
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  );
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
}

