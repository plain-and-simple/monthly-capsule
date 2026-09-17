import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import sharp from "sharp";
import type { CapsuleArchive, CapsuleArchiveLetter, CapsuleArchivePhoto } from "@/lib/capsule-archive";
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

export { DOWNLOAD_PDF_LABEL };
export const PDF_CONTENT_TYPE = "application/pdf";
export const PDF_PHOTO_MAX_EDGE = 1200;
export const PDF_PHOTO_JPEG_QUALITY = 70;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

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
}): Promise<Uint8Array> {
  const theme = parseCapsuleTheme(input.archive.theme);
  const palette = themePdfPalette(theme);
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const photoByPath = new Map(input.photos.map((photo) => [photo.storage_path, photo.bytes]));

  const title =
    input.monthLabelText ??
    capsuleTitle(monthLabel(input.archive.year_month), input.archive.month_version);
  const groupName = groupDisplayName(input.archive.group_name);
  const cursor = new PdfCursor(doc, palette, PAGE_HEIGHT - MARGIN);

  drawCover(cursor, theme, {
    serif,
    serifBold,
    serifItalic,
    sans,
    groupName,
    title,
    names: input.archive.letters.map((letter) => letter.preferred_name),
  });

  if (input.archive.letters.length === 0) {
    cursor.wrapped("No letters this month.", {
      font: serifItalic,
      size: 13,
      lineGap: 4,
      color: palette.muted,
    });
  } else {
    for (let i = 0; i < input.archive.letters.length; i += 1) {
      const letter = input.archive.letters[i]!;
      if (i > 0) cursor.letterRule(theme);
      await drawPerson(doc, cursor, theme, letter, { serif, serifBold, serifItalic, sans }, photoByPath);
    }
  }

  cursor.y -= 16;
  cursor.rule(10);
  cursor.wrapped(missedCountPhrase(input.archive.missed_count), {
    font: theme === "heritage" || theme === "warm" ? serifItalic : sans,
    size: 10,
    lineGap: 3,
    color: palette.muted,
  });

  return doc.save();
}

function drawCover(
  cursor: PdfCursor,
  theme: CapsuleTheme,
  input: {
    serif: PDFFont;
    serifBold: PDFFont;
    serifItalic: PDFFont;
    sans: PDFFont;
    groupName: string;
    title: string;
    names: string[];
  },
) {
  const names = contributorsLine(input.names);
  if (theme === "warm") {
    cursor.ribbon(winAnsi(input.title), input.sans);
    cursor.text(winAnsi(input.groupName), {
      font: input.serifBold,
      size: 28,
      color: cursor.palette.ink,
      gap: 10,
    });
  } else if (theme === "minimal") {
    cursor.text("Capsule", {
      font: input.sans,
      size: 9,
      color: cursor.palette.muted,
      gap: 8,
    });
    cursor.text(winAnsi(input.title), {
      font: input.serifBold,
      size: 26,
      color: cursor.palette.ink,
      gap: 8,
    });
    cursor.text(winAnsi(input.groupName), {
      font: input.sans,
      size: 12,
      color: cursor.palette.muted,
      gap: 8,
    });
  } else if (theme === "heritage") {
    cursor.text("A keepsake", {
      font: input.serifItalic,
      size: 11,
      color: cursor.palette.accent,
      gap: 8,
      center: true,
    });
    cursor.text(winAnsi(input.title), {
      font: input.serifBold,
      size: 26,
      color: cursor.palette.ink,
      gap: 8,
      center: true,
    });
    cursor.text(winAnsi(input.groupName), {
      font: input.serif,
      size: 12,
      color: cursor.palette.muted,
      gap: 10,
      center: true,
    });
  } else {
    cursor.text(winAnsi(input.groupName).toUpperCase(), {
      font: input.sans,
      size: 9,
      color: cursor.palette.muted,
      gap: 8,
    });
    cursor.text(winAnsi(input.title), {
      font: input.serifBold,
      size: 28,
      color: cursor.palette.ink,
      gap: 10,
    });
  }

  if (names) {
    cursor.wrapped(winAnsi(names), {
      font: input.sans,
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
  fonts: { serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; sans: PDFFont },
  photoByPath: Map<string, Uint8Array>,
) {
  const blocks = layoutPersonSection(theme, letter);
  for (const block of blocks) {
    await drawBlock(doc, cursor, theme, block, fonts, photoByPath);
  }
}

async function drawBlock(
  doc: PDFDocument,
  cursor: PdfCursor,
  theme: CapsuleTheme,
  block: LetterBlock,
  fonts: { serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; sans: PDFFont },
  photoByPath: Map<string, Uint8Array>,
) {
  if (block.kind === "heading") {
    const center = theme === "minimal" || theme === "heritage";
    cursor.text(winAnsi(block.name), {
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
      cursor.wrapped(winAnsi(line || " "), {
        font: fonts.serif,
        size: 12,
        lineGap: 4,
        color: cursor.palette.ink,
        center: theme === "heritage",
      });
    }
    cursor.y -= 8;
    return;
  }
  if (block.kind === "gallery") {
    const cols = block.variant === "strip" ? 3 : 2;
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

class PdfCursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly palette: PdfPalette,
    y: number,
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = y;
    this.paintPage();
  }

  ensure(needed: number) {
    if (this.y - needed >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.paintPage();
    this.y = PAGE_HEIGHT - MARGIN;
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
      font: PDFFont;
      size: number;
      color: RGB;
      gap?: number;
      center?: boolean;
    },
  ) {
    this.ensure(opts.size + 6);
    const width = opts.font.widthOfTextAtSize(value, opts.size);
    const x = opts.center ? MARGIN + Math.max(0, (CONTENT_WIDTH - width) / 2) : MARGIN;
    this.page.drawText(value, {
      x,
      y: this.y - opts.size,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
    this.y -= opts.size + (opts.gap ?? 0);
  }

  wrapped(
    value: string,
    opts: {
      font: PDFFont;
      size: number;
      lineGap: number;
      color: RGB;
      paragraphGap?: number;
      center?: boolean;
    },
  ) {
    const lines = wrapLine(value, opts.font, opts.size, CONTENT_WIDTH);
    for (const line of lines) {
      this.text(line, {
        font: opts.font,
        size: opts.size,
        color: opts.color,
        gap: opts.lineGap,
        center: opts.center,
      });
    }
    if (opts.paragraphGap) this.y -= opts.paragraphGap;
  }

  ribbon(value: string, font: PDFFont) {
    const size = 10;
    const padX = 10;
    const padY = 5;
    const width = Math.min(CONTENT_WIDTH, font.widthOfTextAtSize(value, size) + padX * 2);
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
    this.page.drawText(value, {
      x: MARGIN + padX,
      y: this.y + padY,
      size,
      font,
      color: this.palette.paper,
    });
    this.y -= 12;
  }

  rule(gapAfter = 20) {
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

  async image(image: PDFImage, maxH: number) {
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
    this.y -= 14;
  }

  async plate(image: PDFImage, caption: string, captionFont: PDFFont) {
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
    const colW = (CONTENT_WIDTH - opts.gap * (opts.cols - 1)) / opts.cols;
    for (let i = 0; i < photos.length; i += opts.cols) {
      const slice = photos.slice(i, i + opts.cols);
      const images: Array<{ image: PDFImage; w: number; h: number }> = [];
      for (const photo of slice) {
        const image = await embedPhoto(doc, photoByPath.get(photo.storage_path));
        if (!image) continue;
        const scale = Math.min(colW / image.width, opts.maxH / image.height, 1);
        images.push({ image, w: image.width * scale, h: image.height * scale });
      }
      if (images.length === 0) continue;
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
      });
      this.y -= 12;
    }
  }
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      const trial = chunk + char;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        chunk = trial;
      } else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
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

function winAnsi(value: string): string {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
}
