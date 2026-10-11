import { PDFDocument, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import sharp from "sharp";
import type { CapsuleArchive, CapsuleArchiveLetter, CapsuleArchivePhoto } from "@/lib/capsule-archive";
import {
  CAPSULE_PDF_PRODUCER,
  drawPdfRuns,
  embedCapsulePdfFonts,
  layoutPdfRuns,
  widthOfPdfRuns,
  widthOfPdfText,
  type CapsulePdfFonts,
  type PdfTypeFace,
} from "@/lib/capsule-pdf-fonts";
import {
  capsuleThemeMeta,
  layoutPersonSection,
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
export const PDF_SIDE_PHOTO_MAX = 210;
export const PDF_SIDE_PHOTO_FRACTION = 0.42;
export const PDF_SIDE_PHOTO_GUTTER = 14;
export const PDF_PHOTO_SHRINK_MIN = 120;
export const PDF_PHOTO_ENSURE_PAD = 16;

const PAGE_WIDTH = PDF_PAGE_WIDTH;
const PAGE_HEIGHT = PDF_PAGE_HEIGHT;
const MARGIN = PDF_MARGIN;
const CONTENT_WIDTH = PDF_CONTENT_WIDTH;

export type CapsulePdfLayoutEvent = {
  kind: "heading" | "photo" | "text" | "page";
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
  return theme === "heritage" ? 16 : 18;
}

export function sideTextColumnWidth(): number {
  return CONTENT_WIDTH - CONTENT_WIDTH * PDF_SIDE_PHOTO_FRACTION - PDF_SIDE_PHOTO_GUTTER;
}

export function clampSidePhotoHeight(textHeight: number): number {
  return Math.min(PDF_SIDE_PHOTO_MAX, Math.max(PDF_SIDE_PHOTO_MIN, textHeight));
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

  const placeQueued = async (inset: boolean) => {
    while (queued.length > 0 && !cursor.hasActiveWrap()) {
      const next = queued.shift()!;
      await placeWeavePhoto(doc, cursor, next.block, fonts, photoByPath, next.pairedText, inset);
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
  const width = firstIsWeave ? sideTextColumnWidth() : CONTENT_WIDTH;
  const firstTextHeight = firstText
    ? estimateWrappedHeight(
        firstText.text,
        fonts.serif,
        fonts.emoji,
        PDF_BODY_SIZE,
        PDF_BODY_LINE_GAP,
        width,
      )
    : hasPhoto
      ? PDF_PHOTO_SHRINK_MIN
      : 0;
  const photoHeight = firstIsWeave ? clampSidePhotoHeight(firstTextHeight || PDF_SIDE_PHOTO_MIN) : 0;
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
  } else {
    await cursor.image(image, maxH, block.photo.storage_path);
  }
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
    const cols = leftoverGalleryCols(block.variant, block.photos);
    const maxH = block.variant === "strip" ? 110 : 180;
    await cursor.gallery(doc, block.photos, photoByPath, { cols, maxH, gap: 8 });
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
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = y;
    this.paintPage();
    this.record({ kind: "page", page: this.pageIndex, y: this.y });
  }

  setPerson(name: string | null) {
    this.person = name;
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
    if (this.y - needed >= MARGIN) return;
    this.wrap = null;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.paintPage();
    this.pageIndex += 1;
    this.y = PAGE_HEIGHT - MARGIN;
    this.record({ kind: "page", page: this.pageIndex, y: this.y });
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
    const remaining = this.y - MARGIN;
    const shrink = shrinkSidePhotoToRemaining(sized.h, remaining);
    if (shrink.pageBreak) {
      this.ensure(sized.h + PDF_PHOTO_ENSURE_PAD);
    } else if (shrink.height !== sized.h) {
      sized = fit(shrink.height);
    }
    if (this.y - sized.h < MARGIN) this.ensure(sized.h + PDF_PHOTO_ENSURE_PAD);
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

  async gallery(
    doc: PDFDocument,
    photos: readonly CapsuleArchivePhoto[],
    photoByPath: Map<string, Uint8Array>,
    opts: { cols: number; maxH: number; gap: number },
  ) {
    this.finishWrap();
    for (let i = 0; i < photos.length; i += opts.cols) {
      const slice = photos.slice(i, i + opts.cols);
      const preview: Array<{ image: PDFImage; storage_path: string }> = [];
      for (const photo of slice) {
        const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
        if (image) preview.push({ image, storage_path: photo.storage_path });
      }
      if (preview.length === 0) continue;
      const cols = preview.length;
      const colW = (CONTENT_WIDTH - opts.gap * (cols - 1)) / cols;
      const images = preview.map((entry) => {
        const scale = Math.min(colW / entry.image.width, opts.maxH / entry.image.height, 1);
        return {
          image: entry.image,
          storage_path: entry.storage_path,
          w: entry.image.width * scale,
          h: entry.image.height * scale,
        };
      });
      const rowH = Math.max(...images.map((entry) => entry.h));
      this.ensure(rowH + 12);
      this.y -= rowH;
      images.forEach((entry, index) => {
        const x = MARGIN + index * (colW + opts.gap) + (colW - entry.w) / 2;
        this.page.drawImage(entry.image, {
          x,
          y: this.y,
          width: entry.w,
          height: entry.h,
        });
        this.record({
          kind: "photo",
          person: this.person ?? undefined,
          page: this.pageIndex,
          x,
          y: this.y + entry.h,
          width: entry.w,
          bottom: this.y,
          height: entry.h,
          storage_path: entry.storage_path,
        });
      });
      this.y -= 12;
    }
  }
}

function takeLine(
  words: string[],
  font: PdfTypeFace,
  emoji: PdfTypeFace,
  size: number,
  maxWidth: number,
): { line: string; rest: string[] } {
  if (words.length === 0) return { line: "", rest: [] };
  let current = "";
  let count = 0;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (widthOfPdfText(next, size, font, emoji) <= maxWidth) {
      current = next;
      count += 1;
      continue;
    }
    break;
  }
  if (count > 0) return { line: current, rest: words.slice(count) };

  const word = words[0]!;
  if (widthOfPdfText(word, size, font, emoji) <= maxWidth) {
    return { line: word, rest: words.slice(1) };
  }
  let chunk = "";
  for (const char of word) {
    const trial = chunk + char;
    if (widthOfPdfText(trial, size, font, emoji) <= maxWidth || chunk.length === 0) {
      chunk = trial;
    } else {
      break;
    }
  }
  const leftover = word.slice(chunk.length);
  return { line: chunk, rest: leftover ? [leftover, ...words.slice(1)] : words.slice(1) };
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

