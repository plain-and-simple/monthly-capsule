import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

export const CAPSULE_PDF_PRODUCER = "monthly-capsule-unicode/1";

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), "pdf-fonts");

const FONT_FILES = {
  serif: "LiberationSerif-Regular.ttf",
  serifBold: "LiberationSerif-Bold.ttf",
  serifItalic: "LiberationSerif-Italic.ttf",
  sans: "LiberationSans-Regular.ttf",
  emoji: "NotoEmoji-Variable.ttf",
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
  const bytes = new Uint8Array(readFileSync(join(fontsDir, filename)));
  fontBytesCache.set(filename, bytes);
  return bytes;
}

function asTypeFace(font: PDFFont): PdfTypeFace {
  return { font, glyphs: new Set(font.getCharacterSet()) };
}

export async function embedCapsulePdfFonts(doc: PDFDocument): Promise<CapsulePdfFonts> {
  doc.registerFontkit(fontkit as never);
  const [serif, serifBold, serifItalic, sans, emoji] = await Promise.all([
    doc.embedFont(readPdfFontFile(FONT_FILES.serif), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.serifBold), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.serifItalic), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.sans), { subset: true }),
    doc.embedFont(readPdfFontFile(FONT_FILES.emoji), { subset: true }),
  ]);
  return {
    serif: asTypeFace(serif),
    serifBold: asTypeFace(serifBold),
    serifItalic: asTypeFace(serifItalic),
    sans: asTypeFace(sans),
    emoji: asTypeFace(emoji),
  };
}

function isIgnorableCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0xfe0e ||
    codePoint === 0xfe0f ||
    codePoint === 0x200b ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0x2060
  );
}

export function pickPdfFont(char: string, primary: PdfTypeFace, fallback: PdfTypeFace): PDFFont | null {
  const codePoint = char.codePointAt(0);
  if (codePoint == null) return null;
  if (primary.glyphs.has(codePoint)) return primary.font;
  if (fallback.glyphs.has(codePoint)) return fallback.font;
  if (isIgnorableCodePoint(codePoint)) return null;
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

export function widthOfPdfText(
  value: string,
  size: number,
  primary: PdfTypeFace,
  fallback: PdfTypeFace,
): number {
  return widthOfPdfRuns(layoutPdfRuns(value, primary, fallback), size);
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

export function capsulePdfNeedsUnicodeRerender(bytes: Uint8Array): boolean {
  const haystack = pdfHaystack(bytes);
  return !haystack.includes("Liberation") || !haystack.includes("NotoEmoji");
}
