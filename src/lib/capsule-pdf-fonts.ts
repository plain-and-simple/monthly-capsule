import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";
import subsetFont from "subset-font";

export const CAPSULE_PDF_PRODUCER = "monthly-capsule-layout/3";

/** Traced onto the Vercel function disk next to process.cwd(); never resolve from the bundled module URL. */
export const PDF_FONTS_DIR = join(process.cwd(), "src/lib/pdf-fonts");

const FONT_FILES = {
  serif: "LiberationSerif-Regular.ttf",
  serifBold: "LiberationSerif-Bold.ttf",
  serifItalic: "LiberationSerif-Italic.ttf",
  sans: "LiberationSans-Regular.ttf",
  emoji: "NotoEmoji-Regular.ttf",
} as const;

export type PdfTypeFace = {
  font: PDFFont;
  glyphs: ReadonlySet<number>;
};

export type CapsulePdfFonts = {
  serif: PdfTypeFace;
  serifBold: PdfTypeFace;
  serifItalic: PdfTypeFace;
  sans: PdfTypeFace;
  emoji: PdfTypeFace;
};

export type PdfTextRun = { text: string; font: PDFFont };

const fontBytesCache = new Map<string, Uint8Array>();

function readPdfFontFile(filename: string): Uint8Array {
  const cached = fontBytesCache.get(filename);
  if (cached) return cached;
  const bytes = new Uint8Array(readFileSync(join(PDF_FONTS_DIR, filename)));
  fontBytesCache.set(filename, bytes);
  return bytes;
}

function asTypeFace(font: PDFFont): PdfTypeFace {
  return { font, glyphs: new Set(font.getCharacterSet()) };
}

type FontkitCmap = { characterSet: number[] };

let emojiCoverage: Set<number> | null = null;

function emojiFontCoverage(): Set<number> {
  if (emojiCoverage) return emojiCoverage;
  const face = fontkit.create(readPdfFontFile(FONT_FILES.emoji)) as FontkitCmap;
  emojiCoverage = new Set(face.characterSet);
  return emojiCoverage;
}

export function capsulePdfHaystack(
  archive: {
    group_name: string;
    year_month: string;
    letters: readonly { preferred_name: string; body: string }[];
  },
  extra: readonly string[] = [],
): string {
  return [
    archive.group_name,
    archive.year_month,
    ...extra,
    ...archive.letters.flatMap((letter) => [letter.preferred_name, letter.body]),
  ].join("\n");
}

export function collectEmojiCodePoints(text: string, liberation: readonly PdfTypeFace[]): number[] {
  const missing = new Set<number>();
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint == null || isIgnorablePdfCodePoint(codePoint)) continue;
    if (liberation.some((face) => face.glyphs.has(codePoint))) continue;
    missing.add(codePoint);
  }
  if (missing.size === 0) return [];
  const covered = emojiFontCoverage();
  return [...missing].filter((codePoint) => covered.has(codePoint));
}

function emptyEmojiFace(liberation: readonly PdfTypeFace[]): PdfTypeFace {
  return { font: liberation[0]!.font, glyphs: new Set() };
}

async function embedEmojiFace(
  doc: PDFDocument,
  liberation: readonly PdfTypeFace[],
  text: string,
): Promise<PdfTypeFace> {
  try {
    const codePoints = collectEmojiCodePoints(text, liberation);
    if (codePoints.length === 0) return emptyEmojiFace(liberation);
    const subset = await subsetFont(
      Buffer.from(readPdfFontFile(FONT_FILES.emoji)),
      String.fromCodePoint(...codePoints),
      { targetFormat: "sfnt" },
    );
    // Already a HarfBuzz subset. fontkit's subsetter corrupts Noto Emoji outlines.
    return asTypeFace(await doc.embedFont(new Uint8Array(subset), { subset: false }));
  } catch (error) {
    console.error("capsule pdf emoji subset failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return emptyEmojiFace(liberation);
  }
}

export async function embedCapsulePdfFonts(doc: PDFDocument, text = ""): Promise<CapsulePdfFonts> {
  doc.registerFontkit(fontkit as never);
  const [serif, serifBold, serifItalic, sans] = await Promise.all([
    doc.embedFont(readPdfFontFile(FONT_FILES.serif), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.serifBold), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.serifItalic), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.sans), { subset: true }),
  ]);
  const liberation = [
    asTypeFace(serif),
    asTypeFace(serifBold),
    asTypeFace(serifItalic),
    asTypeFace(sans),
  ] as const;
  return {
    serif: liberation[0],
    serifBold: liberation[1],
    serifItalic: liberation[2],
    sans: liberation[3],
    emoji: await embedEmojiFace(doc, liberation, text),
  };
}

export function isIgnorablePdfCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0xfe0e ||
    codePoint === 0xfe0f ||
    codePoint === 0x200b ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0x2060 ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
  );
}

export function pickPdfFont(char: string, primary: PdfTypeFace, fallback: PdfTypeFace): PDFFont | null {
  const codePoint = char.codePointAt(0);
  if (codePoint == null) return null;
  // Skip VS16 / ZWJ / skin-tone even when a face maps them, so they never draw a box.
  if (isIgnorablePdfCodePoint(codePoint)) return null;
  if (primary.glyphs.has(codePoint)) return primary.font;
  if (fallback.glyphs.has(codePoint)) return fallback.font;
  return primary.font;
}

export function layoutPdfRuns(value: string, primary: PdfTypeFace, fallback: PdfTypeFace): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  let current = "";
  let currentFont: PDFFont | null = null;
  for (const char of value) {
    const font = pickPdfFont(char, primary, fallback);
    if (!font) continue;
    if (currentFont && font !== currentFont) {
      runs.push({ text: current, font: currentFont });
      current = char;
      currentFont = font;
      continue;
    }
    current += char;
    currentFont = font;
  }
  if (current && currentFont) runs.push({ text: current, font: currentFont });
  return runs;
}

export function widthOfPdfRuns(runs: readonly PdfTextRun[], size: number): number {
  return runs.reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, size), 0);
}

const pdfWidthCache = new WeakMap<PDFFont, Map<string, number>>();

function pdfWidthCacheKey(size: number, fallback: PDFFont, value: string): string {
  const fallbackName = typeof fallback.name === "string" ? fallback.name : "fallback";
  return `${size}\0${fallbackName}\0${value}`;
}

export function widthOfPdfText(
  value: string,
  size: number,
  primary: PdfTypeFace,
  fallback: PdfTypeFace,
): number {
  let cached = pdfWidthCache.get(primary.font);
  if (!cached) {
    cached = new Map();
    pdfWidthCache.set(primary.font, cached);
  }
  const key = pdfWidthCacheKey(size, fallback.font, value);
  const hit = cached.get(key);
  if (hit != null) return hit;
  const width = widthOfPdfRuns(layoutPdfRuns(value, primary, fallback), size);
  cached.set(key, width);
  return width;
}

/** Greedy fill by cached word widths, then settle the wrap point with exact joined widths. */
export function takePdfLine(
  words: string[],
  primary: PdfTypeFace,
  fallback: PdfTypeFace,
  size: number,
  maxWidth: number,
): { line: string; rest: string[] } {
  if (words.length === 0) return { line: "", rest: [] };

  const space = widthOfPdfText(" ", size, primary, fallback);
  let count = 0;
  let acc = 0;
  for (let i = 0; i < words.length; i += 1) {
    const wordWidth = widthOfPdfText(words[i]!, size, primary, fallback);
    const next = i === 0 ? wordWidth : acc + space + wordWidth;
    if (next <= maxWidth) {
      acc = next;
      count = i + 1;
      continue;
    }
    break;
  }

  const exact = (n: number) =>
    n <= 0 ? 0 : widthOfPdfText(words.slice(0, n).join(" "), size, primary, fallback);
  while (count > 0 && exact(count) > maxWidth) count -= 1;
  while (count < words.length && exact(count + 1) <= maxWidth) count += 1;

  if (count > 0) return { line: words.slice(0, count).join(" "), rest: words.slice(count) };

  const word = words[0]!;
  if (widthOfPdfText(word, size, primary, fallback) <= maxWidth) {
    return { line: word, rest: words.slice(1) };
  }

  const chars = [...word];
  let lo = 1;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const trial = chars.slice(0, mid).join("");
    if (widthOfPdfText(trial, size, primary, fallback) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  const chunk = chars.slice(0, lo).join("");
  const leftover = word.slice(chunk.length);
  return { line: chunk, rest: leftover ? [leftover, ...words.slice(1)] : words.slice(1) };
}

export function drawPdfRuns(
  page: PDFPage,
  runs: readonly PdfTextRun[],
  x: number,
  y: number,
  size: number,
  color: RGB,
): number {
  let cursor = x;
  for (const run of runs) {
    page.drawText(run.text, {
      x: cursor,
      y,
      size,
      font: run.font,
      color,
    });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
  return cursor;
}

function pdfHaystack(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    try {
      parts.push(inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      // JPEG / already uncompressed
    }
  }
  return parts.join("\n");
}

function utf16BeHex(value: string): string {
  let hex = "FEFF";
  for (const char of value) {
    hex += char.charCodeAt(0).toString(16).padStart(4, "0");
  }
  return hex.toUpperCase();
}

export function capsulePdfHasProducerMark(bytes: Uint8Array): boolean {
  const haystack = pdfHaystack(bytes);
  if (haystack.includes(CAPSULE_PDF_PRODUCER)) return true;
  return haystack.toUpperCase().includes(utf16BeHex(CAPSULE_PDF_PRODUCER));
}

export function capsulePdfNeedsUnicodeRerender(bytes: Uint8Array): boolean {
  return !capsulePdfHasProducerMark(bytes);
}

export function selectEnsuredCapsulePdf<T extends { bytes: Uint8Array }>(
  stored: T | null,
  generated: T | null,
): T | null {
  if (stored && !capsulePdfNeedsUnicodeRerender(stored.bytes)) return stored;
  return generated ?? stored;
}
