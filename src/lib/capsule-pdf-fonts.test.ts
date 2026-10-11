import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildCapsuleArchive } from "./capsule-archive";
import {
  buildCapsulePdfBytes,
  PDF_BODY_LINE_GAP,
  PDF_BODY_SIZE,
  pdfLineBoxHeight,
  type CapsulePdfLayoutEvent,
} from "./capsule-pdf";
import {
  CAPSULE_PDF_PRODUCER,
  drawPdfRuns,
  embedCapsulePdfFonts,
  isIgnorablePdfCodePoint,
  layoutPdfRuns,
  PDF_FONTS_DIR,
  takePdfLine,
  widthOfPdfText,
} from "./capsule-pdf-fonts";
import { CAPSULE_THEMES } from "./capsule-theme";

const EMOJI_LINE = "plain 😅 🎉 ❤️ 👍🏽 👨‍👩‍👧 text";
const BASE_EMOJI = [0x1f605, 0x1f389, 0x2764, 0x1f44d, 0x1f468, 0x1f469, 0x1f467];

function ttfTableTags(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tags: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = 12 + i * 16;
    tags.push(String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!));
  }
  return tags;
}

function extractEmbeddedTtfs(pdf: Uint8Array): Uint8Array[] {
  const raw = Buffer.from(pdf).toString("latin1");
  const fonts: Uint8Array[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    let bytes = Buffer.from(match[1]!, "latin1");
    try {
      bytes = Buffer.from(inflateSync(bytes));
    } catch {
      // already uncompressed
    }
    if (bytes.length < 12) continue;
    const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    const isSfnt =
      tag === "true" ||
      tag === "OTTO" ||
      (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00);
    if (isSfnt) fonts.push(new Uint8Array(bytes));
  }
  return fonts;
}

function ttfTables(bytes: Uint8Array): Map<string, { offset: number; length: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i += 1) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
    tables.set(tag, { offset: view.getUint32(o + 8), length: view.getUint32(o + 12) });
  }
  return tables;
}

function ttfCmapGlyphId(bytes: Uint8Array, codePoint: number): number | null {
  const cmap = ttfTables(bytes).get("cmap");
  if (!cmap) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(cmap.offset + 2);
  let fmt4: number | null = null;
  let fmt12: number | null = null;
  for (let i = 0; i < numTables; i += 1) {
    const rec = cmap.offset + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const sub = cmap.offset + view.getUint32(rec + 4);
    const format = view.getUint16(sub);
    if (format === 12 && (platform === 0 || (platform === 3 && encoding === 10))) fmt12 = sub;
    if (format === 4 && (platform === 0 || (platform === 3 && encoding === 1))) fmt4 = sub;
  }
  if (fmt12 != null) {
    const nGroups = view.getUint32(fmt12 + 12);
    for (let i = 0; i < nGroups; i += 1) {
      const group = fmt12 + 16 + i * 12;
      const start = view.getUint32(group);
      const end = view.getUint32(group + 4);
      const startId = view.getUint32(group + 8);
      if (codePoint >= start && codePoint <= end) return startId + (codePoint - start);
    }
  }
  if (fmt4 != null && codePoint <= 0xffff) {
    const segCount = view.getUint16(fmt4 + 6) / 2;
    const endCodes = fmt4 + 14;
    const startCodes = endCodes + 2 + segCount * 2;
    const deltas = startCodes + segCount * 2;
    const ranges = deltas + segCount * 2;
    for (let i = 0; i < segCount; i += 1) {
      const end = view.getUint16(endCodes + i * 2);
      const start = view.getUint16(startCodes + i * 2);
      if (codePoint < start || codePoint > end) continue;
      const delta = view.getInt16(deltas + i * 2);
      const rangeOffset = view.getUint16(ranges + i * 2);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyphOffset = ranges + i * 2 + rangeOffset + (codePoint - start) * 2;
      const gid = view.getUint16(glyphOffset);
      return gid === 0 ? null : (gid + delta) & 0xffff;
    }
  }
  return null;
}

function ttfGlyphContourCounts(bytes: Uint8Array): number[] {
  const tables = ttfTables(bytes);
  const maxp = tables.get("maxp");
  const loca = tables.get("loca");
  const glyf = tables.get("glyf");
  const head = tables.get("head");
  if (!maxp || !loca || !glyf || !head) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numGlyphs = view.getUint16(maxp.offset + 4);
  const indexToLocFormat = view.getInt16(head.offset + 50);
  const loc = (gid: number) =>
    indexToLocFormat === 0
      ? view.getUint16(loca.offset + gid * 2) * 2
      : view.getUint32(loca.offset + gid * 4);
  const counts: number[] = [];
  for (let gid = 0; gid < numGlyphs; gid += 1) {
    const start = loc(gid);
    const end = loc(gid + 1);
    if (end <= start) {
      counts.push(0);
      continue;
    }
    counts.push(view.getInt16(glyf.offset + start));
  }
  return counts;
}

function joinedRunText(value: string, primary: Awaited<ReturnType<typeof embedCapsulePdfFonts>>["serif"], fallback: Awaited<ReturnType<typeof embedCapsulePdfFonts>>["emoji"]) {
  return layoutPdfRuns(value, primary, fallback)
    .map((run) => run.text)
    .join("");
}

function hasPdftoppm(): boolean {
  return spawnSync("pdftoppm", ["-v"], { encoding: "utf8" }).status === 0;
}

async function rasterDarkPixels(pdf: Uint8Array): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "capsule-emoji-"));
  const pdfPath = join(dir, "line.pdf");
  writeFileSync(pdfPath, pdf);
  const prefix = join(dir, "line");
  const result = spawnSync("pdftoppm", ["-png", "-r", "144", "-f", "1", "-l", "1", pdfPath, prefix], {
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const png = readFileSync(`${prefix}-1.png`);
  const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i]! < 250 || data[i + 1]! < 250 || data[i + 2]! < 250) dark += 1;
  }
  return dark;
}

describe("static emoji font", () => {
  it("ships a static Regular instance without fvar/gvar", () => {
    const bytes = new Uint8Array(readFileSync(join(PDF_FONTS_DIR, "NotoEmoji-Regular.ttf")));
    const tags = ttfTableTags(bytes);
    expect(tags).toContain("glyf");
    expect(tags).not.toContain("fvar");
    expect(tags).not.toContain("gvar");
    expect(CAPSULE_PDF_PRODUCER).toBe("monthly-capsule-layout/3");
    expect(existsSync(join(PDF_FONTS_DIR, "NotoEmoji-Variable.ttf"))).toBe(false);
  });

  it("skips VS16, ZWJ, and skin-tone so sequences draw base glyphs only", async () => {
    const fonts = await embedCapsulePdfFonts(await PDFDocument.create(), EMOJI_LINE);
    expect(isIgnorablePdfCodePoint(0xfe0f)).toBe(true);
    expect(isIgnorablePdfCodePoint(0x200d)).toBe(true);
    expect(isIgnorablePdfCodePoint(0x1f3fd)).toBe(true);

    const drawn = joinedRunText(EMOJI_LINE, fonts.serif, fonts.emoji);
    expect(drawn).toContain("plain");
    expect(drawn).toContain("text");
    expect(drawn).toContain("😅");
    expect(drawn).toContain("🎉");
    expect(drawn).toContain("\u2764");
    expect(drawn).toContain("👍");
    expect(drawn).toContain("👨");
    expect(drawn).toContain("👩");
    expect(drawn).toContain("👧");
    expect(drawn).not.toContain("\uFE0F");
    expect(drawn).not.toContain("\u200D");
    expect(drawn).not.toContain("\u{1F3FD}");

    const scratch = await PDFDocument.create();
    expect(() =>
      drawPdfRuns(
        scratch.addPage(),
        layoutPdfRuns(EMOJI_LINE, fonts.serif, fonts.emoji),
        36,
        700,
        12,
        rgb(0.1, 0.1, 0.1),
      ),
    ).not.toThrow();
  });

  it("embeds non-empty emoji outlines and rasterizes visible ink", async () => {
    const source = readFileSync(new URL("./capsule-pdf-fonts.ts", import.meta.url), "utf8");
    expect(source).toContain("subsetFont");
    expect(source).toMatch(/embedFont\(new Uint8Array\(subset\),\s*\{\s*subset:\s*false/);

    const doc = await PDFDocument.create();
    const fonts = await embedCapsulePdfFonts(doc, EMOJI_LINE);
    const page = doc.addPage([612, 200]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 200, color: rgb(1, 1, 1) });
    drawPdfRuns(page, layoutPdfRuns(EMOJI_LINE, fonts.serif, fonts.emoji), 36, 90, 28, rgb(0.1, 0.1, 0.1));
    const bytes = await doc.save({ useObjectStreams: false });

    const latinDoc = await PDFDocument.create();
    const latinFonts = await embedCapsulePdfFonts(latinDoc, "plain text");
    const latinPage = latinDoc.addPage([612, 200]);
    latinPage.drawRectangle({ x: 0, y: 0, width: 612, height: 200, color: rgb(1, 1, 1) });
    drawPdfRuns(latinPage, layoutPdfRuns("plain     text", latinFonts.serif, latinFonts.emoji), 36, 90, 28, rgb(0.1, 0.1, 0.1));
    const latinBytes = await latinDoc.save({ useObjectStreams: false });

    const sourceEmoji = new Uint8Array(readFileSync(join(PDF_FONTS_DIR, "NotoEmoji-Regular.ttf")));
    const embedded = extractEmbeddedTtfs(bytes);
    expect(embedded.length).toBeGreaterThan(0);
    for (const codePoint of BASE_EMOJI) {
      const sourceGid = ttfCmapGlyphId(sourceEmoji, codePoint);
      const sourceContours = sourceGid == null ? 0 : ttfGlyphContourCounts(sourceEmoji)[sourceGid]!;
      expect(sourceContours).toBeGreaterThan(0);
      expect(sourceContours).toBeLessThan(64);

      const hit = embedded.find((ttf) => {
        const gid = ttfCmapGlyphId(ttf, codePoint);
        if (gid == null) return false;
        const count = ttfGlyphContourCounts(ttf)[gid] ?? 0;
        return count > 0 && count < 64;
      });
      expect(hit, `embedded cmap/outline missing U+${codePoint.toString(16)}`).toBeTruthy();
    }

    if (hasPdftoppm()) {
      const ink = await rasterDarkPixels(bytes);
      const latin = await rasterDarkPixels(latinBytes);
      expect(ink).toBeGreaterThan(latin + 200);
    }
  });

  it("keeps line boxes and wrap pitch identical with or without emoji on every live theme", async () => {
    const fonts = await embedCapsulePdfFonts(await PDFDocument.create(), "🎉");
    const box = pdfLineBoxHeight(fonts.serif, PDF_BODY_SIZE);
    const pitch = PDF_BODY_SIZE + PDF_BODY_LINE_GAP;
    const plain = "The river path stayed muddy after the storm so we took the long way around.";
    const withEmoji = "The river path stayed 🎉 muddy after the storm so we took the long way around.";

    const emojiAdvance = widthOfPdfText("🎉", PDF_BODY_SIZE, fonts.serif, fonts.emoji);
    const mixed = widthOfPdfText("stayed 🎉 muddy", PDF_BODY_SIZE, fonts.serif, fonts.emoji);
    const parts =
      widthOfPdfText("stayed ", PDF_BODY_SIZE, fonts.serif, fonts.emoji) +
      emojiAdvance +
      widthOfPdfText(" muddy", PDF_BODY_SIZE, fonts.serif, fonts.emoji);
    expect(mixed).toBeCloseTo(parts, 5);

    const wide = takePdfLine(["hello", "🎉", "world"], fonts.serif, fonts.emoji, PDF_BODY_SIZE, 500);
    expect(wide.line).toBe("hello 🎉 world");
    expect(wide.rest).toEqual([]);

    for (const theme of CAPSULE_THEMES) {
      const plainLayout: CapsulePdfLayoutEvent[] = [];
      const emojiLayout: CapsulePdfLayoutEvent[] = [];
      await buildCapsulePdfBytes({
        archive: buildCapsuleArchive({
          yearMonth: "2026-10",
          groupName: "Regression Kitchen",
          memberCount: 1,
          theme,
          letters: [{ preferred_name: "Alex Rivera", body: plain, photos: [] }],
        }),
        photos: [],
        layout: plainLayout,
      });
      await buildCapsulePdfBytes({
        archive: buildCapsuleArchive({
          yearMonth: "2026-10",
          groupName: "Regression Kitchen",
          memberCount: 1,
          theme,
          letters: [{ preferred_name: "Alex Rivera", body: withEmoji, photos: [] }],
        }),
        photos: [],
        layout: emojiLayout,
      });

      const plainLines = plainLayout.filter((event) => event.kind === "text" && event.person === "Alex Rivera");
      const emojiLines = emojiLayout.filter((event) => event.kind === "text" && event.person === "Alex Rivera");
      expect(plainLines.length).toBeGreaterThan(0);
      expect(emojiLines.length).toBeGreaterThan(0);
      expect(plainLines.every((line) => line.height === box)).toBe(true);
      expect(emojiLines.every((line) => line.height === box)).toBe(true);
      expect(plainLines[0]!.y).toBe(emojiLines[0]!.y);

      const pitches = (lines: CapsulePdfLayoutEvent[]) =>
        lines
          .slice(1)
          .map((line, index) => (line.page === lines[index]!.page ? lines[index]!.y - line.y : null))
          .filter((value): value is number => value != null);
      expect(pitches(plainLines).every((value) => value === pitch)).toBe(true);
      expect(pitches(emojiLines).every((value) => value === pitch)).toBe(true);
    }

    const source = readFileSync(new URL("./capsule-pdf.ts", import.meta.url), "utf8");
    expect(source).toMatch(/pdfLineBoxHeight\(opts\.font/);
    expect(source).not.toMatch(/pdfLineBoxHeight\([^)]*emoji/);
  });

  it("embeds the emoji face only when a letter uses a covered codepoint", async () => {
    const noEmoji = await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        letters: [{ preferred_name: "Alex Rivera", body: "The plum tree finally did something.", photos: [] }],
      }),
      photos: [],
    });
    const withEmoji = await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        letters: [
          {
            preferred_name: "Alex Rivera",
            body: "October note with plain 😅 🎉 ❤️ 👍🏽 👨‍👩‍👧 text mixed in.",
            photos: [],
          },
        ],
      }),
      photos: [],
    });
    expect(noEmoji.length).toBeLessThan(80_000);
    expect(withEmoji.length).toBeLessThan(80_000);
    expect(withEmoji.length).toBeGreaterThan(noEmoji.length);
    expect(withEmoji.length - noEmoji.length).toBeLessThan(40_000);
    const noEmojiFonts = extractEmbeddedTtfs(noEmoji);
    expect(noEmojiFonts.every((ttf) => ttf.length < 100_000)).toBe(true);
    expect(Math.max(...extractEmbeddedTtfs(withEmoji).map((ttf) => ttf.length))).toBeLessThan(30_000);
  });
});
