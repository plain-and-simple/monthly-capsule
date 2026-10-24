import { PDFDocument, rgb, type RGB } from "pdf-lib";
import sharp from "sharp";
import type { CapsuleArchive } from "@/lib/capsule-archive";
import { B2_PAGE_H, layoutCapsuleDocument, parseFaceBoxes, type DocumentPlan } from "@/lib/capsule-b2";
import { capsulePhotoKey, renderCapsuleHtml, type CapsuleHtmlImage } from "@/lib/capsule-b2-html";
import { printHtmlToPdf, getCapsuleBrowser } from "@/lib/capsule-pdf-chromium";
import { preparePlacedPhotoJpeg } from "@/lib/capsule-pdf-image";
import {
  CAPSULE_PDF_PRODUCER,
  takePdfLine,
  widthOfPdfText,
  type PdfTypeFace,
} from "@/lib/capsule-pdf-fonts";
import { capsuleThemeMeta, parseCapsuleTheme, type CapsuleTheme } from "@/lib/capsule-theme";
import { contributorsLine, DOWNLOAD_PDF_LABEL, groupDisplayName } from "@/lib/copy";
import { capsulePath, capsuleTitle, DEFAULT_MONTH_VERSION } from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";
import { missedCountPhrase } from "@/lib/submit";

export {
  CAPSULE_PDF_PRODUCER,
  capsulePdfNeedsUnicodeRerender,
  embedCapsulePdfFonts,
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

export type PdfPhotoWarning = {
  storagePath: string;
  effectivePpi: number;
};

export type PdfBuildTiming = {
  prepMs: number;
  launchMs: number;
  renderMs: number;
  uploadMs: number;
  warnings: PdfPhotoWarning[];
};

export function createPdfBuildTiming(): PdfBuildTiming {
  return { prepMs: 0, launchMs: 0, renderMs: 0, uploadMs: 0, warnings: [] };
}

/** One line per build: prep, launch, render, upload. Low-res photos are a metric, not a failure. */
export function logPdfServerTiming(timing: PdfBuildTiming): void {
  const parts = [
    `prep;dur=${timing.prepMs.toFixed(1)}`,
    `launch;dur=${timing.launchMs.toFixed(1)}`,
    `render;dur=${timing.renderMs.toFixed(1)}`,
    `upload;dur=${timing.uploadMs.toFixed(1)}`,
  ];
  if (timing.warnings.length > 0) parts.push(`lowres;dur=${timing.warnings.length}`);
  console.info(`server-timing ${parts.join(", ")}`);
  for (const warning of timing.warnings) {
    console.warn(
      `capsule-pdf low-res effective_ppi=${warning.effectivePpi.toFixed(1)} path=${warning.storagePath}`,
    );
  }
}

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

export async function preparePdfJpegFitted(bytes: Uint8Array, maxEdge: number): Promise<Uint8Array | null> {
  if (bytes.length === 0) return null;
  const edge = Math.max(32, Math.min(PDF_PHOTO_MAX_EDGE, Math.round(maxEdge)));
  try {
    const out = await sharp(bytes, { failOn: "none", sequentialRead: true })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: PDF_PHOTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

function planForArchive(archive: CapsuleArchive, monthLabelText?: string): DocumentPlan {
  const theme = parseCapsuleTheme(archive.theme);
  const groupName = groupDisplayName(archive.group_name);
  const title = monthLabelText ?? capsuleTitle(monthLabel(archive.year_month), archive.month_version);
  return layoutCapsuleDocument({
    groupName,
    monthLabel: title,
    theme,
    missedLine: missedCountPhrase(archive.missed_count),
    contributors: contributorsLine(archive.letters.map((letter) => letter.preferred_name)),
    letters: archive.letters.map((letter) => ({
      preferredName: letter.preferred_name,
      body: letter.body,
      photos: [...letter.photos]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((photo, index) => ({
          storagePath: photo.storage_path,
          width: photo.width,
          height: photo.height,
          faces: parseFaceBoxes(photo.faces),
          order: photo.sort_order ?? index,
        })),
    })),
  });
}

/** Layout events without launching Chromium. y is the top edge in a y-up page. */
export function planCapsulePdfLayout(archive: CapsuleArchive, monthLabelText?: string): CapsulePdfLayoutEvent[] {
  const layout: CapsulePdfLayoutEvent[] = [];
  recordB2Layout(planForArchive(archive, monthLabelText), layout);
  return layout;
}

function recordB2Layout(plan: DocumentPlan, layout: CapsulePdfLayoutEvent[] | undefined) {
  if (!layout) return;
  plan.pages.forEach((page, index) => {
    const pageNumber = index + 1;
    for (const line of page.lines) {
      const y = B2_PAGE_H - line.y;
      if (line.role === "name" && page.personName) {
        layout.push({
          kind: "heading",
          page: pageNumber,
          name: page.personName,
          person: page.personName,
          y,
          x: line.x,
          width: line.w,
          height: line.h,
          bottom: y - line.h,
        });
      } else if (line.role === "body") {
        layout.push({
          kind: "text",
          page: pageNumber,
          person: page.personName ?? undefined,
          text: line.text,
          x: line.x,
          y,
          width: line.w,
          height: line.h,
          bottom: y - line.h,
        });
      }
    }
    for (const photo of page.photos) {
      const y = B2_PAGE_H - photo.y;
      layout.push({
        kind: "photo",
        page: pageNumber,
        person: page.personName ?? undefined,
        storage_path: photo.storagePath,
        x: photo.x,
        y,
        width: photo.w,
        height: photo.h,
        bottom: y - photo.h,
      });
    }
  });
}

export async function buildCapsulePdfBytes(input: {
  archive: CapsuleArchive;
  photos: readonly CapsulePdfPhotoBytes[];
  monthLabelText?: string;
  layout?: CapsulePdfLayoutEvent[];
  timing?: PdfBuildTiming;
}): Promise<Uint8Array> {
  const timing = input.timing ?? createPdfBuildTiming();
  const report = !input.timing;
  const launchStart = performance.now();
  let launchError: unknown;
  const launchTask = getCapsuleBrowser().then(
    () => {
      timing.launchMs = performance.now() - launchStart;
    },
    (error: unknown) => {
      timing.launchMs = performance.now() - launchStart;
      launchError = error;
    },
  );
  try {
    const groupName = groupDisplayName(input.archive.group_name);
    const title =
      input.monthLabelText ??
      capsuleTitle(monthLabel(input.archive.year_month), input.archive.month_version);
    const plan = planForArchive(input.archive, input.monthLabelText);
    recordB2Layout(plan, input.layout);
    const prepStart = performance.now();
    const bytesByPath = new Map(input.photos.map((photo) => [photo.storage_path, photo.bytes]));
    const images = new Map<string, CapsuleHtmlImage>();
    for (let pageIndex = 0; pageIndex < plan.pages.length; pageIndex += 1) {
      const page = plan.pages[pageIndex]!;
      for (let photoIndex = 0; photoIndex < page.photos.length; photoIndex += 1) {
        const photo = page.photos[photoIndex]!;
        const bytes = bytesByPath.get(photo.storagePath);
        if (!bytes) continue;
        const prepared = await preparePlacedPhotoJpeg(bytes, photo);
        if (!prepared) continue;
        if (prepared.lowRes) {
          timing.warnings.push({ storagePath: photo.storagePath, effectivePpi: prepared.effectivePpi });
        }
        images.set(capsulePhotoKey(pageIndex, photoIndex), {
          src: `data:image/jpeg;base64,${Buffer.from(prepared.jpeg).toString("base64")}`,
          left: prepared.left,
          top: prepared.top,
          width: prepared.width,
          height: prepared.height,
        });
      }
    }
    timing.prepMs = performance.now() - prepStart;
    await launchTask;
    if (launchError) throw launchError;
    const printed = await printHtmlToPdf(renderCapsuleHtml(plan, images), timing);
    const doc = await PDFDocument.load(printed);
    doc.setProducer(CAPSULE_PDF_PRODUCER);
    doc.setCreator(CAPSULE_PDF_PRODUCER);
    doc.setKeywords([CAPSULE_PDF_PRODUCER]);
    doc.setTitle(`${groupName} — ${title}`);
    return doc.save({ useObjectStreams: false });
  } finally {
    await launchTask;
    if (report) logPdfServerTiming(timing);
  }
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

