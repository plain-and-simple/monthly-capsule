import { inflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { buildCapsuleArchive } from "./capsule-archive";
import {
  buildCapsulePdfBytes,
  planCapsulePdfLayout,
  capsulePdfFilename,
  capsulePdfHref,
  capsulePdfNeedsUnicodeRerender,
  capsulePdfStoragePath,
  clampSidePhotoHeight,
  detectImageKind,
  estimateWrappedHeight,
  headingKeepWithNextFits,
  headingKeepWithNextNeeded,
  layoutBoxesOverlap,
  leftoverGalleryCols,
  packLeftoverRowCounts,
  justifiedRowMetrics,
  measureTextBesidePhoto,
  PDF_CONTENT_WIDTH,
  PDF_LEFTOVER_GAP,
  PDF_LEFTOVER_MAX_H,
  PDF_SIDE_PHOTO_MIN_LONG,
  lineBoxOverlapsWrap,
  PDF_BODY_LINE_GAP,
  PDF_BODY_SIZE,
  PDF_HEADING_GAP,
  PDF_MARGIN,
  PDF_PAGE_CONTENT_HEIGHT,
  PDF_PAGE_HEIGHT,
  PDF_PHOTO_SHRINK_MIN,
  PDF_SIDE_PHOTO_MAX,
  PDF_SIDE_PHOTO_MIN,
  PDF_WRAP_CLEAR_GAP,
  pdfContentDisposition,
  preparePdfJpeg,
  selectEnsuredCapsulePdf,
  shrinkSidePhotoToRemaining,
  themePdfPalette,
  type CapsulePdfLayoutEvent,
} from "./capsule-pdf";
import {
  CAPSULE_PDF_PRODUCER,
  capsulePdfHasProducerMark,
  embedCapsulePdfFonts,
  takePdfLine,
  widthOfPdfText,
} from "./capsule-pdf-fonts";
import { DOWNLOAD_PDF_LABEL } from "./copy";
import {
  buildVisualArchive,
  fillerBody,
  KEEP_TARGET_BODY,
  LONG_RUNON_BODY,
  TEN_LINE_OPENING,
} from "./capsule-pdf-fixtures";
import { CAPSULE_THEMES } from "./capsule-theme";
import { capsuleTitle } from "./month-version";
import { shutdownCapsuleBrowser } from "./capsule-pdf-chromium";

const here = dirname(fileURLToPath(import.meta.url));

function source(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

function utf16BeFromHex(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 3 < hex.length; i += 4) {
    units.push(parseInt(hex.slice(i, i + 4), 16));
  }
  return String.fromCharCode(...units);
}

function parseToUnicodeCmap(stream: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(pair[1]!.toUpperCase(), utf16BeFromHex(pair[2]!));
    }
  }
  for (const block of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1]!;
    for (const range of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g)) {
      const start = parseInt(range[1]!, 16);
      const dests = [...range[3]!.matchAll(/<([0-9A-Fa-f]+)>/g)];
      dests.forEach((dest, index) => {
        map.set((start + index).toString(16).toUpperCase().padStart(range[1]!.length, "0"), utf16BeFromHex(dest[1]!));
      });
    }
    for (const range of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const start = parseInt(range[1]!, 16);
      const end = parseInt(range[2]!, 16);
      const dest = parseInt(range[3]!, 16);
      const width = range[1]!.length;
      for (let code = start; code <= end; code += 1) {
        const key = code.toString(16).toUpperCase().padStart(width, "0");
        const unicode = (dest + (code - start)).toString(16).toUpperCase().padStart(4, "0");
        map.set(key, utf16BeFromHex(unicode));
      }
    }
  }
  return map;
}

function decodeGlyphHex(hex: string, cmap: Map<string, string>): string {
  const width = cmap.keys().next().value?.length ?? 4;
  const normalized = hex.toUpperCase();
  if (width === 0 || normalized.length % width !== 0) return "";
  let text = "";
  for (let i = 0; i < normalized.length; i += width) {
    const glyph = cmap.get(normalized.slice(i, i + width));
    if (glyph == null) return "";
    text += glyph;
  }
  return text;
}

function decodePdfLiteral(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = body[i + 1];
    if (!next) break;
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next >= "0" && next <= "7") {
      let oct = next;
      for (let k = 0; k < 2; k += 1) {
        const digit = body[i + 1];
        if (!digit || digit < "0" || digit > "7") break;
        oct += digit;
        i += 1;
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}

type PdfObject = { dict: string; stream: string | null };

function parsePdfObjects(bytes: Uint8Array): Map<number, PdfObject> {
  const raw = Buffer.from(bytes).toString("latin1");
  const objects = new Map<number, PdfObject>();
  const re = /(\d+)\s+0\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const id = Number(match[1]);
    const start = match.index + match[0].length;
    const end = raw.indexOf("endobj", start);
    if (end < 0) break;
    const body = raw.slice(start, end);
    const streamAt = body.search(/\bstream\r?\n/);
    if (streamAt < 0) {
      objects.set(id, { dict: body, stream: null });
    } else {
      const dict = body.slice(0, streamAt);
      const length = Number(dict.match(/\/Length\s+(\d+)/)?.[1] ?? 0);
      const dataAt = body.indexOf("\n", streamAt) + 1;
      const payload = body.slice(dataAt, dataAt + length);
      let stream = payload;
      try {
        stream = inflateSync(Buffer.from(payload, "latin1")).toString("latin1");
      } catch {
        stream = payload;
      }
      objects.set(id, { dict, stream });
    }
    re.lastIndex = end + 6;
  }
  return objects;
}

function extractContentText(stream: string, fonts: ReadonlyMap<string, Map<string, string>>): string {
  const blocks: string[] = [];
  let current = "";
  let font: Map<string, string> | null = null;
  let inText = false;
  const token = /\/(F\d+)\s+[-\d.]+\s+Tf|BT\b|ET\b|<([0-9A-Fa-f]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  for (const found of stream.matchAll(token)) {
    if (found[1]) {
      font = fonts.get(found[1]) ?? font;
      continue;
    }
    if (found[0].startsWith("BT")) {
      inText = true;
      current = "";
      continue;
    }
    if (found[0].startsWith("ET")) {
      if (current) blocks.push(current);
      current = "";
      inText = false;
      continue;
    }
    let piece = "";
    if (found[2] && font) piece = decodeGlyphHex(found[2], font);
    else if (found[3] != null) piece = decodePdfLiteral(found[3]);
    if (!piece) continue;
    if (!inText) blocks.push(piece);
    else current += piece;
  }
  if (current) blocks.push(current);
  return blocks.join("\n");
}

function pdfExtractText(bytes: Uint8Array): string {
  const objects = parsePdfObjects(bytes);
  const fontCmaps = new Map<number, Map<string, string>>();
  for (const [id, object] of objects) {
    const toUnicode = object.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!toUnicode || !object.dict.includes("/Font")) continue;
    const cmapStream = objects.get(Number(toUnicode[1]))?.stream;
    if (!cmapStream) continue;
    const cmap = parseToUnicodeCmap(cmapStream);
    if (cmap.size > 0) fontCmaps.set(id, cmap);
  }
  const chunks: string[] = [];
  for (const object of objects.values()) {
    if (!object.dict.includes("/Contents") || !object.dict.includes("/Font")) continue;
    const fontBlock = object.dict.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!fontBlock) continue;
    const fonts = new Map<string, Map<string, string>>();
    for (const ref of fontBlock[1]!.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
      const cmap = fontCmaps.get(Number(ref[2]));
      if (cmap) fonts.set(ref[1]!, cmap);
    }
    const contentIds = [...object.dict.matchAll(/\/Contents\s*(?:\[([\s\S]*?)\]|(\d+)\s+0\s+R)/g)].flatMap((entry) => {
      if (entry[2]) return [Number(entry[2])];
      return [...(entry[1] ?? "").matchAll(/(\d+)\s+0\s+R/g)].map((id) => Number(id[1]));
    });
    for (const contentId of contentIds) {
      const stream = objects.get(contentId)?.stream;
      if (stream) chunks.push(extractContentText(stream, fonts));
    }
  }
  return chunks.join("\n");
}

async function tinyJpeg(): Promise<Uint8Array> {
  return sharp({
    create: { width: 12, height: 8, channels: 3, background: "#336699" },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function tinyWebp(): Promise<Uint8Array> {
  return sharp({
    create: { width: 10, height: 10, channels: 3, background: "#c47a3a" },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

const letter = {
  preferred_name: "Wren",
  body: "The plum tree finally did something.\n\nA second thought.",
  photos: [{ storage_path: "g/m/0.jpg", width: 12, height: 8, sort_order: 0 }],
};

describe("capsule pdf helpers", () => {
  it("builds stable storage paths, download hrefs, and filenames", () => {
    expect(capsulePdfStoragePath("g1", "2026-09", 1)).toBe("g1/pdfs/2026-09/v1.pdf");
    expect(capsulePdfHref("g1", "2026-09", 1)).toBe("/g/g1/capsule/2026-09/pdf");
    expect(capsulePdfHref("g1", "2026-09", 2)).toBe("/g/g1/capsule/2026-09/v2/pdf");
    expect(capsulePdfFilename("Cedar Street", "2026-09", 1)).toBe("cedar-street-2026-09.pdf");
    expect(capsulePdfFilename("Cedar Street", "2026-09", 2)).toBe("cedar-street-2026-09-v2.pdf");
    expect(pdfContentDisposition('cedar-street-2026-09.pdf')).toContain(
      'filename="cedar-street-2026-09.pdf"',
    );
  });

  it("detects jpeg, png, webp, and rejects unknown bytes", async () => {
    const jpeg = await tinyJpeg();
    const webp = await tinyWebp();
    expect(detectImageKind(jpeg)).toBe("jpeg");
    expect(detectImageKind(webp)).toBe("webp");
    expect(detectImageKind(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("re-encodes webp to jpeg so pdf-lib can embed it", async () => {
    const jpeg = await preparePdfJpeg(await tinyWebp());
    expect(jpeg).not.toBeNull();
    expect(detectImageKind(jpeg!)).toBe("jpeg");
  });
});

describe("themed pdf keepsake", () => {
  afterAll(async () => {
    await shutdownCapsuleBrowser();
  });

  it("renders classic letter text, contributors, and an embedded photo", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 2,
      theme: "classic",
      letters: [letter],
    });
    const bytes = await buildCapsulePdfBytes({
      archive,
      photos: [{ storage_path: "g/m/0.jpg", bytes: await tinyJpeg() }],
    });
    const text = pdfExtractText(bytes);
    expect(Buffer.from(bytes.slice(0, 4)).toString("ascii")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(800);
    expect(text).toContain("Wren");
    expect(text).toContain("plum tree");
    expect(text).toContain("In this issue");
    expect(text).toContain("CEDAR STREET");
  });

  it("heritage uses leftover plates and the keepsake kicker", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      theme: "heritage",
      letters: [
        {
          preferred_name: "Wren",
          body: "The plum tree finally did something.",
          photos: [
            { storage_path: "g/m/0.jpg", width: 12, height: 8, sort_order: 0 },
            { storage_path: "g/m/1.jpg", width: 12, height: 8, sort_order: 1 },
          ],
        },
      ],
    });
    const jpeg = await tinyJpeg();
    const bytes = await buildCapsulePdfBytes({
      archive,
      photos: [
        { storage_path: "g/m/0.jpg", bytes: jpeg },
        { storage_path: "g/m/1.jpg", bytes: jpeg },
      ],
    });
    const text = pdfExtractText(bytes);
    expect(text).toContain("A keepsake");
    expect(text).toContain("Wren");
  });

  it("minimal and warm still carry the letter and group name", async () => {
    for (const theme of ["minimal", "warm"] as const) {
      const archive = buildCapsuleArchive({
        yearMonth: "2026-09",
        groupName: "Cedar Street",
        memberCount: 1,
        theme,
        letters: [letter],
      });
      const bytes = await buildCapsulePdfBytes({
        archive,
        photos: [{ storage_path: "g/m/0.jpg", bytes: await tinyJpeg() }],
      });
      const text = pdfExtractText(bytes);
      expect(text).toContain("Wren");
      expect(text).toContain("Cedar Street");
      expect(text).toContain("plum tree");
    }
  });

  it("newspaper wrap still includes both paragraphs next to photos on every theme", async () => {
    const jpeg = await tinyJpeg();
    for (const theme of ["classic", "warm", "minimal", "heritage"] as const) {
      const archive = buildCapsuleArchive({
        yearMonth: "2026-09",
        groupName: "Cedar Street",
        memberCount: 1,
        theme,
        letters: [
          {
            preferred_name: "Wren",
            body: "The plum tree finally did something this year after we almost gave up on it.\n\nA second thought about the porch light and the rain that would not quit.",
            photos: [
              { storage_path: "g/m/0.jpg", width: 800, height: 600, sort_order: 0 },
              { storage_path: "g/m/1.jpg", width: 800, height: 600, sort_order: 1 },
            ],
          },
        ],
      });
      const bytes = await buildCapsulePdfBytes({
        archive,
        photos: [
          { storage_path: "g/m/0.jpg", bytes: jpeg },
          { storage_path: "g/m/1.jpg", bytes: jpeg },
        ],
      });
      const text = pdfExtractText(bytes).replace(/\s+/g, " ");
      expect(text).toContain("plum tree");
      expect(text).toContain("porch light");
    }
    expect(source("./capsule-pdf.ts")).toContain("layoutCapsuleDocument");
    expect(source("./capsule-pdf.ts")).toContain("printHtmlToPdf");
    expect(source("./capsule-theme.ts")).toContain("leftoverPhotoBlocks");
  });

  it("embeds a webp photo after converting it", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [letter],
    });
    const withPhoto = await buildCapsulePdfBytes({
      archive,
      photos: [{ storage_path: "g/m/0.jpg", bytes: await tinyWebp() }],
    });
    const without = await buildCapsulePdfBytes({ archive, photos: [] });
    expect(Buffer.from(withPhoto.slice(0, 4)).toString("ascii")).toBe("%PDF");
    expect(withPhoto.length).toBeGreaterThan(without.length);
  });

  it("still renders when a photo cannot be embedded", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [letter],
    });
    const bytes = await buildCapsulePdfBytes({
      archive,
      photos: [{ storage_path: "g/m/0.jpg", bytes: new Uint8Array([0, 1, 2, 3]) }],
    });
    expect(Buffer.from(bytes.slice(0, 4)).toString("ascii")).toBe("%PDF");
    expect(pdfExtractText(bytes)).toContain("Wren");
  });

  it("empty months say no letters", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 2,
      letters: [],
    });
    const bytes = await buildCapsulePdfBytes({ archive, photos: [] });
    expect(pdfExtractText(bytes)).toContain("No letters this month.");
  });

  it("theme palettes follow the catalog paper/ink/accent", () => {
    expect(themePdfPalette("classic").ink.red).toBeCloseTo(0x1a / 255, 5);
    expect(themePdfPalette("warm").accent.red).toBeCloseTo(0xc4 / 255, 5);
  });

  it("keeps curly apostrophes, smart quotes, dashes, ellipsis, and emoji", async () => {
    const body = "She said “hello” — it’s … 🎉";
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [{ preferred_name: "Wren", body, photos: [] }],
    });
    const bytes = await buildCapsulePdfBytes({ archive, photos: [] });
    const text = pdfExtractText(bytes);
    expect(text).toContain("\u201c");
    expect(text).toContain("hello");
    expect(text).toContain("\u201d");
    expect(text).toContain("\u2014");
    expect(text).toContain("it\u2019s");
    expect(text).toContain("\u2026");
    expect(text).toContain("🎉");
    expect(text).not.toContain("it?s");
    expect(text).not.toMatch(/said \?hello\?/);
    expect(text).not.toMatch(/ \? /);
    expect(archive.html).toContain(body);
    expect(archive.html).not.toContain("it?s");
  });

  it("re-renders stored WinAnsi PDFs in place and leaves unicode PDFs alone", async () => {
    const oldDoc = await PDFDocument.create();
    const times = await oldDoc.embedFont(StandardFonts.TimesRoman);
    oldDoc.addPage().drawText("hello", { x: 72, y: 720, size: 12, font: times });
    const oldBytes = await oldDoc.save();
    expect(capsulePdfNeedsUnicodeRerender(oldBytes)).toBe(true);

    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [{ preferred_name: "Wren", body: "it’s fine", photos: [] }],
    });
    const neu = await buildCapsulePdfBytes({ archive, photos: [] });
    expect(capsulePdfNeedsUnicodeRerender(neu)).toBe(false);
    expect(pdfExtractText(neu)).toContain("it\u2019s");
  });

  it("does not mark a freshly built PDF with no emoji for rebuild", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [{ preferred_name: "Wren", body: "The plum tree finally did something.", photos: [] }],
    });
    const bytes = await buildCapsulePdfBytes({ archive, photos: [] });
    expect(capsulePdfHasProducerMark(bytes)).toBe(true);
    expect(capsulePdfNeedsUnicodeRerender(bytes)).toBe(false);
  });

  it("falls back to the stored PDF when rebuild fails", async () => {
    const oldDoc = await PDFDocument.create();
    const times = await oldDoc.embedFont(StandardFonts.TimesRoman);
    oldDoc.addPage().drawText("hello", { x: 72, y: 720, size: 12, font: times });
    const oldBytes = await oldDoc.save();
    const stored = { tag: "stored", bytes: oldBytes };
    expect(capsulePdfNeedsUnicodeRerender(oldBytes)).toBe(true);
    expect(selectEnsuredCapsulePdf(stored, null)?.tag).toBe("stored");

    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [{ preferred_name: "Wren", body: "it’s fine", photos: [] }],
    });
    const rebuilt = {
      tag: "rebuilt",
      bytes: await buildCapsulePdfBytes({ archive, photos: [] }),
    };
    expect(selectEnsuredCapsulePdf(stored, rebuilt)?.tag).toBe("rebuilt");
    expect(selectEnsuredCapsulePdf(rebuilt, null)?.tag).toBe("rebuilt");
  });
});

describe("pdf layout locks", () => {
  it("sizes side photos to paired text and shrinks before a page break", () => {
    expect(clampSidePhotoHeight(40)).toBe(PDF_SIDE_PHOTO_MIN);
    expect(clampSidePhotoHeight(400)).toBe(PDF_SIDE_PHOTO_MAX);
    expect(clampSidePhotoHeight(120)).toBe(PDF_SIDE_PHOTO_MIN_LONG);
    expect(clampSidePhotoHeight(160)).toBe(160);
    expect(shrinkSidePhotoToRemaining(210, 400)).toEqual({ height: 210, pageBreak: false });
    expect(shrinkSidePhotoToRemaining(210, 90)).toEqual({ height: 210, pageBreak: true });
    const shrink = shrinkSidePhotoToRemaining(210, 150);
    expect(shrink.pageBreak).toBe(false);
    expect(shrink.height).toBeGreaterThanOrEqual(PDF_PHOTO_SHRINK_MIN - 16);
    expect(shrink.height).toBeLessThan(210);
  });

  it("keep-with-next reserves the full first paragraph, and an inset photo if one sits beside it", () => {
    const short = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: 32,
    });
    expect(short).toBe(18 + PDF_HEADING_GAP + 32);
    const tenLines = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: 10 * 16,
    });
    expect(tenLines).toBe(18 + PDF_HEADING_GAP + 10 * 16);
    const withPhoto = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: 80,
      photoHeight: 160,
    });
    expect(withPhoto).toBe(18 + PDF_HEADING_GAP + 160);
    const tallerThanPage = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: PDF_PAGE_CONTENT_HEIGHT * 3,
    });
    expect(tallerThanPage).toBe(PDF_PAGE_CONTENT_HEIGHT);
    expect(source("./capsule-pdf.ts")).not.toContain("PDF_KEEP_WITH_NEXT_LINES");
    expect(headingKeepWithNextFits(PDF_MARGIN + short, short)).toBe(true);
    expect(headingKeepWithNextFits(PDF_MARGIN + short - 1, short)).toBe(false);
  });

  it("keeps the wrap column for any line box that still overlaps the photo, including after a paragraph gap", () => {
    const wrapBottom = 400;
    const box = 16;
    expect(lineBoxOverlapsWrap(400 + 8, box, wrapBottom)).toBe(true);
    expect(lineBoxOverlapsWrap(wrapBottom - PDF_WRAP_CLEAR_GAP, box, wrapBottom)).toBe(false);
    expect(lineBoxOverlapsWrap(wrapBottom + 1, box, wrapBottom)).toBe(true);
    expect(lineBoxOverlapsWrap(391, 12, wrapBottom)).toBe(true);
  });

  it("wraps lines with cached word widths the same way as remesuring the growing string", async () => {
    const fonts = await embedCapsulePdfFonts(await PDFDocument.create());
    const naive = (words: string[], maxWidth: number) => {
      let current = "";
      let count = 0;
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (widthOfPdfText(next, PDF_BODY_SIZE, fonts.serif, fonts.emoji) <= maxWidth) {
          current = next;
          count += 1;
          continue;
        }
        break;
      }
      if (count > 0) return { line: current, rest: words.slice(count) };
      const word = words[0] ?? "";
      let chunk = "";
      for (const char of word) {
        const trial = chunk + char;
        if (
          widthOfPdfText(trial, PDF_BODY_SIZE, fonts.serif, fonts.emoji) <= maxWidth ||
          chunk.length === 0
        ) {
          chunk = trial;
        } else {
          break;
        }
      }
      return { line: chunk, rest: word.slice(chunk.length) ? [word.slice(chunk.length), ...words.slice(1)] : words.slice(1) };
    };
    const samples = [
      LONG_RUNON_BODY.split(/\s+/).filter(Boolean),
      TEN_LINE_OPENING.replace(/\n/g, " ").split(/\s+/).filter(Boolean),
      ["She", "said", "“hello”", "—", "it’s", "…", "🎉"],
      ["supercalifragilisticexpialidocious"],
    ];
    for (const width of [80, 180, 260, 504]) {
      for (const words of samples) {
        let remaining = words;
        while (remaining.length > 0) {
          const fast = takePdfLine(remaining, fonts.serif, fonts.emoji, PDF_BODY_SIZE, width);
          const slow = naive(remaining, width);
          expect(fast).toEqual(slow);
          remaining = fast.rest;
        }
      }
    }
  });

  it("estimates wrapped height from the column width", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedCapsulePdfFonts(doc);
    const one = estimateWrappedHeight(
      "Hello.",
      fonts.serif,
      fonts.emoji,
      PDF_BODY_SIZE,
      PDF_BODY_LINE_GAP,
      504,
    );
    const many = estimateWrappedHeight(
      "Hello there friend, this line is made long enough that it must wrap in a narrow newspaper column beside a photo.",
      fonts.serif,
      fonts.emoji,
      PDF_BODY_SIZE,
      PDF_BODY_LINE_GAP,
      180,
    );
    expect(one).toBe(PDF_BODY_SIZE + PDF_BODY_LINE_GAP);
    expect(many).toBeGreaterThan(one);
  });

  it("estimates a long first paragraph beside a photo using inset only while the photo overlaps", async () => {
    const fonts = await embedCapsulePdfFonts(await PDFDocument.create());
    const insetWidth = PDF_CONTENT_WIDTH * (1 - 0.42) - 14;
    const allNarrow = estimateWrappedHeight(
      LONG_RUNON_BODY,
      fonts.serif,
      fonts.emoji,
      PDF_BODY_SIZE,
      PDF_BODY_LINE_GAP,
      insetWidth,
    );
    const photoHeight = clampSidePhotoHeight(allNarrow);
    const mixed = measureTextBesidePhoto({
      text: LONG_RUNON_BODY,
      font: fonts.serif,
      emoji: fonts.emoji,
      size: PDF_BODY_SIZE,
      lineGap: PDF_BODY_LINE_GAP,
      insetWidth,
      fullWidth: PDF_CONTENT_WIDTH,
      photoHeight,
    });
    expect(photoHeight).toBe(PDF_SIDE_PHOTO_MAX);
    expect(allNarrow).toBeGreaterThan(photoHeight + 80);
    expect(mixed).toBeLessThan(allNarrow);
    expect(mixed).toBeGreaterThan(photoHeight);
    expect(allNarrow - mixed).toBeGreaterThan(40);
    const oldNeeded = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: allNarrow,
      photoHeight,
    });
    const newNeeded = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: mixed,
      photoHeight,
    });
    expect(newNeeded).toBeLessThan(oldNeeded);
  });

  it("keeps a long run-on paragraph with its photo on that person's page", async () => {
    const fonts = await embedCapsulePdfFonts(await PDFDocument.create());
    const insetWidth = PDF_CONTENT_WIDTH * (1 - 0.42) - 14;
    const allNarrow = estimateWrappedHeight(
      LONG_RUNON_BODY,
      fonts.serif,
      fonts.emoji,
      PDF_BODY_SIZE,
      PDF_BODY_LINE_GAP,
      insetWidth,
    );
    const photoHeight = clampSidePhotoHeight(allNarrow);
    const mixed = measureTextBesidePhoto({
      text: LONG_RUNON_BODY,
      font: fonts.serif,
      emoji: fonts.emoji,
      size: PDF_BODY_SIZE,
      lineGap: PDF_BODY_LINE_GAP,
      insetWidth,
      fullWidth: PDF_CONTENT_WIDTH,
      photoHeight,
    });
    const oldNeeded = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: allNarrow,
      photoHeight,
    });
    const newNeeded = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: mixed,
      photoHeight,
    });
    expect(oldNeeded).toBeGreaterThan(newNeeded);

    const layout = planCapsulePdfLayout(
      buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        letters: [
          { preferred_name: "Casey Nguyen", body: fillerBody(4), photos: [] },
          {
            preferred_name: "Morgan Blake",
            body: LONG_RUNON_BODY,
            photos: [{ storage_path: "g/m0.jpg", width: 1400, height: 900, sort_order: 0 }],
          },
        ],
      }),
    );
    const caseyEnd = [...layout].reverse().find((event) => event.person === "Casey Nguyen" && event.kind === "text");
    const morgan = layout.find((event) => event.kind === "heading" && event.name === "Morgan Blake");
    const firstText = layout.find((event) => event.kind === "text" && event.person === "Morgan Blake");
    const morganPhoto = layout.find((event) => event.kind === "photo" && event.person === "Morgan Blake");
    expect(caseyEnd).toBeTruthy();
    expect(morgan?.page).toBeGreaterThan(caseyEnd!.page);
    expect(firstText?.page).toBe(morgan?.page);
    expect(morganPhoto?.page).toBe(morgan?.page);
    expect(firstText?.text).toContain("river path");
  });

  it("places every photo on that person's pages before the next name", () => {
    const layout = planCapsulePdfLayout(
      buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        letters: [
          {
            preferred_name: "Sam Patel",
            body: "One short note about five pictures.",
            photos: [0, 1, 2, 3, 4].map((index) => ({
              storage_path: `g/s${index}.jpg`,
              width: 800,
              height: 1200,
              sort_order: index,
            })),
          },
          { preferred_name: "Jordan Lee", body: "Next person writes a line.", photos: [] },
        ],
      }),
    );
    const samPhotos = layout.filter((event) => event.kind === "photo" && event.person === "Sam Patel");
    const jordan = layout.find((event) => event.kind === "heading" && event.name === "Jordan Lee");
    expect(samPhotos).toHaveLength(5);
    expect(new Set(samPhotos.map((photo) => photo.storage_path)).size).toBe(5);
    expect(jordan).toBeTruthy();
    for (const photo of samPhotos) {
      expect(photo.page).toBeLessThan(jordan!.page);
      expect(photo.width ?? 0).toBeGreaterThan(40);
    }
  });

  it("uses three leftover columns for portrait-heavy grids", () => {
    const portraits = [
      { width: 800, height: 1200 },
      { width: 700, height: 1100 },
      { width: 900, height: 1400 },
    ];
    expect(leftoverGalleryCols("grid", portraits)).toBe(3);
    expect(leftoverGalleryCols("grid", [{ width: 1200, height: 800 }])).toBe(2);
    expect(leftoverGalleryCols("strip", portraits)).toBe(3);
  });

  it("packs leftover photos into justified rows of 2–3 and avoids a trailing single", () => {
    expect(packLeftoverRowCounts(1)).toEqual([1]);
    expect(packLeftoverRowCounts(2)).toEqual([2]);
    expect(packLeftoverRowCounts(3)).toEqual([3]);
    expect(packLeftoverRowCounts(4)).toEqual([2, 2]);
    expect(packLeftoverRowCounts(5)).toEqual([3, 2]);
    expect(packLeftoverRowCounts(7)).toEqual([3, 2, 2]);
    const row = justifiedRowMetrics([1.5, 1.5, 1.5], PDF_CONTENT_WIDTH, PDF_LEFTOVER_GAP, PDF_LEFTOVER_MAX_H);
    expect(row.widths).toHaveLength(3);
    expect(row.usedWidth).toBeCloseTo(PDF_CONTENT_WIDTH, 5);
    expect(row.height).toBeLessThanOrEqual(PDF_LEFTOVER_MAX_H);
  });

  it("keeps later paragraphs with the photos and does not overlap them", () => {
    const layout = planCapsulePdfLayout(
      buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        letters: [
          {
            preferred_name: "Jordan Lee",
            body: "Short one.\n\nAlso short.\n\nA third paragraph stays clear of both photos.",
            photos: [
              { storage_path: "g/p1.jpg", width: 800, height: 1200, sort_order: 0 },
              { storage_path: "g/p2.jpg", width: 800, height: 1200, sort_order: 1 },
            ],
          },
        ],
      }),
    );
    const photos = layout.filter((event) => event.kind === "photo" && event.person === "Jordan Lee");
    const texts = layout.filter((event) => event.kind === "text" && event.person === "Jordan Lee");
    const joined = texts.map((event) => event.text).join(" ");
    expect(photos).toHaveLength(2);
    expect(joined).toContain("Short one.");
    expect(joined).toContain("Also short.");
    expect(joined).toContain("third paragraph");
    for (const line of texts) {
      for (const image of photos) {
        expect(
          layoutBoxesOverlap(
            { page: line.page, x: line.x!, y: line.y, width: line.width!, height: line.height! },
            { page: image.page, x: image.x!, y: image.y, width: image.width!, height: image.height! },
          ),
        ).toBe(false);
      }
    }
  });

  it("keeps a name heading with its opening lines on that person's page", () => {
    const layout = planCapsulePdfLayout(
      buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        letters: [
          { preferred_name: "Casey Nguyen", body: fillerBody(4), photos: [] },
          {
            preferred_name: "Riley Chen",
            body: KEEP_TARGET_BODY,
            photos: [{ storage_path: "g/r0.jpg", width: 1200, height: 800, sort_order: 0 }],
          },
        ],
      }),
    );
    const caseyEnd = [...layout].reverse().find((event) => event.person === "Casey Nguyen" && event.kind === "text");
    const riley = layout.find((event) => event.kind === "heading" && event.name === "Riley Chen");
    const opening = layout.filter(
      (event) => event.kind === "text" && event.person === "Riley Chen" && (event.text ?? "").includes("stays with the name"),
    );
    expect(caseyEnd).toBeTruthy();
    expect(riley).toBeTruthy();
    expect(riley!.page).toBeGreaterThan(caseyEnd!.page);
    expect(opening.length).toBeGreaterThanOrEqual(10);
    expect(opening.every((event) => event.page === riley!.page)).toBe(true);
    expect(opening.map((event) => event.text).join(" ")).toContain("Line 1");
    expect(opening.map((event) => event.text).join(" ")).toContain("Line 10");
  });

  it("moves a name with a 10-line opening paragraph onto that person's page", async () => {
    const fonts = await embedCapsulePdfFonts(await PDFDocument.create());
    const firstHeight = estimateWrappedHeight(
      TEN_LINE_OPENING,
      fonts.serif,
      fonts.emoji,
      PDF_BODY_SIZE,
      PDF_BODY_LINE_GAP,
      504 * (1 - 0.42) - 14,
    );
    expect(firstHeight).toBeGreaterThan(8 * (PDF_BODY_SIZE + PDF_BODY_LINE_GAP));
    const needed = headingKeepWithNextNeeded({
      headingSize: 18,
      headingGap: PDF_HEADING_GAP,
      firstTextHeight: firstHeight,
      photoHeight: 110,
    });
    expect(needed).toBeGreaterThan(18 + PDF_HEADING_GAP + 8 * 16);
    expect(needed).toBeLessThanOrEqual(PDF_PAGE_CONTENT_HEIGHT);
    const layout = planCapsulePdfLayout(
      buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        letters: [
          {
            preferred_name: "Riley Chen",
            body: KEEP_TARGET_BODY,
            photos: [{ storage_path: "g/r0.jpg", width: 1200, height: 800, sort_order: 0 }],
          },
        ],
      }),
    );
    const riley = layout.find((event) => event.kind === "heading" && event.name === "Riley Chen");
    const opening = layout.filter((event) => event.kind === "text" && /^Line \d+ stays with the name heading/.test(event.text ?? ""));
    expect(riley).toBeTruthy();
    expect(opening).toHaveLength(10);
    expect(opening.every((event) => event.page === riley!.page)).toBe(true);
  });

  it("never lets a text line box intersect a photo on any theme fixture", async () => {
    for (const theme of CAPSULE_THEMES) {
      const { archive } = await buildVisualArchive(theme);
      const layout = planCapsulePdfLayout(archive);
      const texts = layout.filter(
        (event) =>
          event.kind === "text" &&
          event.x != null &&
          event.width != null &&
          event.height != null &&
          event.person,
      );
      const images = layout.filter(
        (event) =>
          event.kind === "photo" && event.x != null && event.width != null && event.height != null,
      );
      expect(texts.length).toBeGreaterThan(0);
      expect(images.length).toBeGreaterThan(0);
      for (const line of texts) {
        for (const image of images) {
          expect(
            layoutBoxesOverlap(
              {
                page: line.page,
                x: line.x!,
                y: line.y,
                width: line.width!,
                height: line.height!,
              },
              {
                page: image.page,
                x: image.x!,
                y: image.y,
                width: image.width!,
                height: image.height!,
              },
            ),
            `${theme} "${line.text}" overlaps a photo on page ${line.page}`,
          ).toBe(false);
        }
      }
    }
  });

  it("finishes one person's photos before the next name heading", () => {
    const layout = planCapsulePdfLayout(
      buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        letters: [
          {
            preferred_name: "Alex Rivera",
            body: "- rye bread\n- two pears\n- leftover mint",
            photos: [
              { storage_path: "g/a1.jpg", width: 800, height: 1200, sort_order: 0 },
              { storage_path: "g/a2.jpg", width: 800, height: 1200, sort_order: 1 },
              { storage_path: "g/a3.jpg", width: 800, height: 1200, sort_order: 2 },
            ],
          },
          {
            preferred_name: "Jordan Lee",
            body: LONG_BODY_SNIP,
            photos: [{ storage_path: "g/j1.jpg", width: 1400, height: 900, sort_order: 0 }],
          },
        ],
      }),
    );
    const jordan = layout.find((event) => event.kind === "heading" && event.name === "Jordan Lee");
    const alexPhotos = layout.filter(
      (event) => event.kind === "photo" && event.person === "Alex Rivera",
    );
    expect(jordan).toBeTruthy();
    expect(alexPhotos.length).toBeGreaterThan(0);
    for (const photo of alexPhotos) {
      const before =
        photo.page < jordan!.page || (photo.page === jordan!.page && photo.bottom! > jordan!.y);
      expect(before).toBe(true);
    }
  });

  it("re-renders an older producer PDF in place without minting a ·vN edition", async () => {
    const oldDoc = await PDFDocument.create();
    oldDoc.setProducer("monthly-capsule-unicode/1");
    oldDoc.addPage();
    const oldBytes = await oldDoc.save();
    expect(capsulePdfNeedsUnicodeRerender(oldBytes)).toBe(true);

    const archive = buildCapsuleArchive({
      yearMonth: "2026-10",
      groupName: "Regression Kitchen",
      memberCount: 1,
      theme: "classic",
      letters: [{ preferred_name: "Alex Rivera", body: "Synthetic note.", photos: [] }],
    });
    expect(archive.theme).toBe("classic");
    expect(archive.month_version).toBe(1);
    const rebuilt = await buildCapsulePdfBytes({ archive, photos: [] });
    expect(capsulePdfHasProducerMark(rebuilt)).toBe(true);
    expect(capsulePdfNeedsUnicodeRerender(rebuilt)).toBe(false);
    expect(selectEnsuredCapsulePdf({ tag: "stored", bytes: oldBytes }, { tag: "rebuilt", bytes: rebuilt })?.tag).toBe(
      "rebuilt",
    );
    expect(capsulePdfStoragePath("g1", "2026-10", 1)).toBe("g1/pdfs/2026-10/v1.pdf");
    expect(capsulePdfFilename("Regression Kitchen", "2026-10", 1)).toBe("regression-kitchen-2026-10.pdf");
    expect(capsuleTitle("October 2026", 1)).toBe("October 2026");
    expect(capsuleTitle("October 2026", 1)).not.toContain("v2");
    expect(CAPSULE_PDF_PRODUCER).toBe("monthly-capsule-b2/1");
    expect(source("./capsule-pdf-store.ts")).toContain("upsert: true");
    expect(source("./capsule-pdf-store.ts")).toContain("capsulePdfNeedsUnicodeRerender");
    expect(source("./capsule-pdf-store.ts")).not.toContain("planForceOpen");
    expect(source("./capsule-pdf-store.ts")).not.toContain("createMonth");
    expect(source("./capsule-pdf-response.ts")).not.toContain("planForceOpen");
    expect(source("./capsule-pdf-store.ts")).toContain("input.version");
  });
});

const LONG_BODY_SNIP =
  "The river path stayed muddy after the storm, so we took the long way around the school and talked about the porch light that has been blinking since August.";

describe("pdf wiring locks", () => {
  it("compile stores a pdf and does not fail the capsule if generation throws", () => {
    const compile = source("./compile.ts");
    expect(compile).toContain("generateAndStoreCapsulePdf");
    expect(compile).toContain("writeCapsulePdfKeepsake");
    expect(compile).toContain("capsule pdf generate failed");
    expect(compile).toContain("pdf_storage_path");
    expect(source("../app/globals.css")).toContain("letter__photo--left");
    expect(source("../app/globals.css")).toContain("float: right");
  });

  it("the capsule page offers Download PDF to members", () => {
    const view = source("../app/(app)/g/[uuid]/capsule/view.tsx");
    expect(view).toContain("DOWNLOAD_PDF_LABEL");
    expect(view).toContain("capsulePdfHref");
    expect(view).toContain("capsule__keepsake");
    expect(DOWNLOAD_PDF_LABEL).toBe("Download PDF");
    expect(source("../app/(app)/g/[uuid]/capsule/[yearMonth]/pdf/route.ts")).toContain(
      "capsulePdfResponse",
    );
    expect(
      source("../app/(app)/g/[uuid]/capsule/[yearMonth]/[edition]/pdf/route.ts"),
    ).toContain("capsulePdfResponse");
    expect(source("./capsule-pdf-response.ts")).toContain("requireGroupMember");
    expect(source("./capsule-pdf.ts")).not.toContain("winAnsi");
    expect(source("./capsule-pdf.ts")).not.toContain("StandardFonts");
    expect(source("./capsule-pdf.ts")).toContain("embedCapsulePdfFonts");
    expect(source("./capsule-pdf-store.ts")).toContain("capsulePdfNeedsUnicodeRerender");
    expect(source("./capsule-pdf-store.ts")).toContain("selectEnsuredCapsulePdf");
    expect(source("./capsule-pdf-fonts.ts")).toContain(CAPSULE_PDF_PRODUCER);
    expect(source("./capsule-pdf-fonts.ts")).toContain('join(process.cwd(), "src/lib/pdf-fonts")');
    expect(source("./capsule-pdf-fonts.ts")).toContain("PDF_FONTS_DIR");
    expect(source("./capsule-pdf-fonts.ts")).not.toMatch(/fileURLToPath|import\.meta\.url/);
    expect(source("../../next.config.ts")).toContain("./src/lib/pdf-fonts/**/*");
  });

  it("email attaches a stored pdf and does not generate during send", () => {
    const email = source("./email.ts");
    expect(email).toContain("loadStoredCapsulePdf");
    expect(email).toContain("attachments");
    expect(email).not.toContain("generateAndStoreCapsulePdf");
    expect(email).not.toContain("ensureCapsulePdf");
  });
});
