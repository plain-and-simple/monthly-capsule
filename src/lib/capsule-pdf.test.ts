import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { buildCapsuleArchive } from "./capsule-archive";
import {
  buildCapsulePdfBytes,
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
import { MAGAZINE_CONTENT_BOTTOM, selectMagazineTemplate } from "./capsule-pdf-magazine";
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

const here = dirname(fileURLToPath(import.meta.url));

function source(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

function inflatePdfStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    try {
      streams.push(inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      streams.push(Buffer.from(match[1], "latin1").toString("latin1"));
    }
  }
  return streams;
}

function utf16BeFromHex(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 3 < hex.length; i += 4) {
    units.push(parseInt(hex.slice(i, i + 4), 16));
  }
  return String.fromCharCode(...units);
}

function parseToUnicodeMaps(streams: readonly string[]): Array<Map<string, string>> {
  const maps: Array<Map<string, string>> = [];
  for (const stream of streams) {
    if (!stream.includes("begincmap")) continue;
    const map = new Map<string, string>();
    for (const entry of stream.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(entry[1]!.toUpperCase().padStart(4, "0"), utf16BeFromHex(entry[2]!));
    }
    if (map.size > 0) maps.push(map);
  }
  return maps;
}

function decodeHexWithCmap(hex: string, cmap: Map<string, string>): string {
  let text = "";
  for (let i = 0; i < hex.length; i += 4) {
    text += cmap.get(hex.slice(i, i + 4)) ?? "";
  }
  return text;
}

function pdfExtractText(bytes: Uint8Array): string {
  const streams = inflatePdfStreams(bytes);
  const cmaps = parseToUnicodeMaps(streams);
  const chunks: string[] = [];
  for (const stream of streams) {
    if (!/\sTj\b/.test(stream) && !/\sTJ\b/.test(stream)) continue;
    for (const entry of stream.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = entry[1]!.toUpperCase();
      if (cmaps.length === 0) {
        chunks.push(Buffer.from(hex, "hex").toString("latin1"));
        continue;
      }
      for (const cmap of cmaps) {
        const text = decodeHexWithCmap(hex, cmap);
        if (text) chunks.push(text);
      }
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
    expect(text).toContain("Contributors: Wren");
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
    expect(text).toContain("Plate I");
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
      const text = pdfExtractText(bytes);
      expect(text).toContain("plum tree");
      expect(text).toContain("porch light");
    }
    expect(source("./capsule-pdf.ts")).toContain("insetImage");
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

  it("keeps a long run-on paragraph with a side photo on the same page when it fits", async () => {
    const jpeg = await sharp({
      create: { width: 1400, height: 900, channels: 3, background: "#1a1712" },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
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

    let proof:
      | { caseyEnd: CapsulePdfLayoutEvent; morgan: CapsulePdfLayoutEvent }
      | null = null;
    for (let n = 8; n <= 40; n += 1) {
      const layout: CapsulePdfLayoutEvent[] = [];
      await buildCapsulePdfBytes({
        archive: buildCapsuleArchive({
          yearMonth: "2026-10",
          groupName: "Regression Kitchen",
          memberCount: 2,
          letters: [
            { preferred_name: "Casey Nguyen", body: fillerBody(n), photos: [] },
            {
              preferred_name: "Morgan Blake",
              body: LONG_RUNON_BODY,
              photos: [{ storage_path: "g/m0.jpg", width: 1400, height: 900, sort_order: 0 }],
            },
          ],
        }),
        photos: [{ storage_path: "g/m0.jpg", bytes: jpeg }],
        layout,
      });
      const caseyEnd = [...layout]
        .reverse()
        .find((event) => event.person === "Casey Nguyen" && event.kind === "text");
      const morgan = layout.find((event) => event.kind === "heading" && event.name === "Morgan Blake");
      const firstText = layout.find(
        (event) => event.kind === "text" && event.person === "Morgan Blake",
      );
      if (!caseyEnd || !morgan || !firstText) continue;
      const remainingAfterCasey = caseyEnd.y - 26;
      const remaining = remainingAfterCasey - PDF_MARGIN;
      if (remaining >= newNeeded && remaining < oldNeeded) {
        expect(morgan.page).toBe(caseyEnd.page);
        expect(firstText.page).toBe(caseyEnd.page);
        proof = { caseyEnd, morgan };
        break;
      }
    }
    expect(proof).not.toBeNull();
  });

  it("lays leftover photos in justified rows inside the person's section", async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#2f5b4c" },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        letters: [
          {
            preferred_name: "Sam Patel",
            body: "One short note.",
            photos: [0, 1, 2, 3, 4].map((index) => ({
              storage_path: `g/s${index}.jpg`,
              width: 800,
              height: 1200,
              sort_order: index,
            })),
          },
          { preferred_name: "Jordan Lee", body: "Next person.", photos: [] },
        ],
      }),
      photos: [0, 1, 2, 3, 4].map((index) => ({
        storage_path: `g/s${index}.jpg`,
        bytes: jpeg,
      })),
      layout,
    });
    const samPhotos = layout.filter(
      (event) => event.kind === "photo" && event.person === "Sam Patel" && event.x != null,
    );
    const jordan = layout.find((event) => event.kind === "heading" && event.name === "Jordan Lee");
    expect(samPhotos.length).toBe(5);
    expect(jordan).toBeTruthy();
    const leftover = samPhotos.slice(1);
    expect(leftover).toHaveLength(4);
    const rows = new Map<string, CapsulePdfLayoutEvent[]>();
    for (const photo of leftover) {
      const key = `${photo.page}:${Math.round(photo.y)}`;
      const row = rows.get(key) ?? [];
      row.push(photo);
      rows.set(key, row);
    }
    expect([...rows.values()].every((row) => row.length === 2)).toBe(true);
    for (const row of rows.values()) {
      const used = row.reduce((sum, photo) => sum + (photo.width ?? 0), 0) + PDF_LEFTOVER_GAP;
      expect(used).toBeGreaterThan(PDF_CONTENT_WIDTH * 0.7);
      expect(row.every((photo) => (photo.width ?? 0) > 80)).toBe(true);
    }
    for (const photo of samPhotos) {
      expect(
        photo.page < jordan!.page || (photo.page === jordan!.page && photo.bottom! > jordan!.y),
      ).toBe(true);
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

  it("keeps later paragraphs beside a photo instead of jumping to its bottom", async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#2f5b4c" },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        letters: [
          {
            preferred_name: "Jordan Lee",
            body: "Short one.\n\nAlso short.\n\nA third paragraph stays in the column beside the first photo until that photo is cleared.",
            photos: [
              { storage_path: "g/p1.jpg", width: 800, height: 1200, sort_order: 0 },
              { storage_path: "g/p2.jpg", width: 800, height: 1200, sort_order: 1 },
            ],
          },
        ],
      }),
      photos: [
        { storage_path: "g/p1.jpg", bytes: jpeg },
        { storage_path: "g/p2.jpg", bytes: jpeg },
      ],
      layout,
    });
    const photo = layout.find((event) => event.kind === "photo" && event.person === "Jordan Lee");
    const texts = layout.filter((event) => event.kind === "text" && event.person === "Jordan Lee");
    expect(photo).toBeTruthy();
    expect(texts.length).toBeGreaterThanOrEqual(3);
    const beside = texts.filter(
      (event) => event.page === photo!.page && event.y > photo!.bottom!,
    );
    expect(beside.length).toBeGreaterThanOrEqual(2);
  });

  it("does not leave a name heading alone at the bottom of a page", async () => {
    const jpeg = await tinyJpeg();
    let proof:
      | {
          caseyEnd: CapsulePdfLayoutEvent;
          riley: CapsulePdfLayoutEvent;
          firstText: CapsulePdfLayoutEvent;
        }
      | null = null;
      const firstLine = TEN_LINE_OPENING.split("\n")[0]!;
      for (let n = 10; n <= 40; n += 1) {
      const layout: CapsulePdfLayoutEvent[] = [];
      await buildCapsulePdfBytes({
        archive: buildCapsuleArchive({
          yearMonth: "2026-10",
          groupName: "Regression Kitchen",
          memberCount: 2,
          letters: [
            { preferred_name: "Casey Nguyen", body: fillerBody(n), photos: [] },
            {
              preferred_name: "Riley Chen",
              body: KEEP_TARGET_BODY,
              photos: [{ storage_path: "g/r0.jpg", width: 12, height: 8, sort_order: 0 }],
            },
          ],
        }),
        photos: [{ storage_path: "g/r0.jpg", bytes: jpeg }],
        layout,
      });
      const caseyEnd = [...layout]
        .reverse()
        .find((event) => event.person === "Casey Nguyen" && event.kind === "text");
      const riley = layout.find((event) => event.kind === "heading" && event.name === "Riley Chen");
      const firstText = layout.find(
        (event) => event.kind === "text" && event.person === "Riley Chen",
      );
      if (!caseyEnd || !riley || !firstText) continue;
      expect(firstText.page).toBe(riley.page);
      expect(firstText.text).toContain("Line 1");
      const needed = headingKeepWithNextNeeded({
        headingSize: 18,
        headingGap: PDF_HEADING_GAP,
        firstTextHeight: 10 * 16,
        photoHeight: 110,
      });
      const remainingAfterCasey = caseyEnd.y - 26;
      if (remainingAfterCasey - PDF_MARGIN < needed && remainingAfterCasey > PDF_MARGIN) {
        expect(riley.page).toBe(caseyEnd.page + 1);
        expect(riley.y).toBeGreaterThan(PDF_PAGE_HEIGHT - 90);
        proof = { caseyEnd, riley, firstText };
        break;
      }
    }
    expect(proof).not.toBeNull();
    expect(proof?.firstText.text).toContain(firstLine.slice(0, 20));
  });

  it("moves a name with a 10-line opening paragraph near the page bottom", async () => {
    const jpeg = await tinyJpeg();
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

    let proof: { riley: CapsulePdfLayoutEvent; lines: CapsulePdfLayoutEvent[] } | null = null;
    for (let n = 10; n <= 45; n += 1) {
      const layout: CapsulePdfLayoutEvent[] = [];
      await buildCapsulePdfBytes({
        archive: buildCapsuleArchive({
          yearMonth: "2026-10",
          groupName: "Regression Kitchen",
          memberCount: 2,
          letters: [
            { preferred_name: "Casey Nguyen", body: fillerBody(n), photos: [] },
            {
              preferred_name: "Riley Chen",
              body: KEEP_TARGET_BODY,
              photos: [{ storage_path: "g/r0.jpg", width: 12, height: 8, sort_order: 0 }],
            },
          ],
        }),
        photos: [{ storage_path: "g/r0.jpg", bytes: jpeg }],
        layout,
      });
      const caseyEnd = [...layout]
        .reverse()
        .find((event) => event.person === "Casey Nguyen" && event.kind === "text");
      const riley = layout.find((event) => event.kind === "heading" && event.name === "Riley Chen");
      const opening = layout.filter(
        (event) =>
          event.kind === "text" &&
          event.person === "Riley Chen" &&
          /^Line \d+ stays with the name heading/.test(event.text ?? ""),
      );
      if (!caseyEnd || !riley || opening.length < 10) continue;
      expect(new Set(opening.map((event) => event.page))).toEqual(new Set([riley.page]));
      const remainingAfterCasey = caseyEnd.y - 26;
      if (remainingAfterCasey - PDF_MARGIN < needed && remainingAfterCasey > PDF_MARGIN) {
        expect(riley.page).toBeGreaterThan(caseyEnd.page);
        expect(opening).toHaveLength(10);
        expect(opening.every((event) => event.page === riley.page)).toBe(true);
        proof = { riley, lines: opening };
        break;
      }
    }
    expect(proof).not.toBeNull();
    expect(proof?.lines.map((event) => event.text).join("\n")).toContain("Line 10");
  });

  it("never lets a text line box intersect a photo on any theme fixture", async () => {
    for (const theme of ["classic", "warm", "minimal", "heritage"] as const) {
      const { archive, photos } = await buildVisualArchive(theme);
      const layout: CapsulePdfLayoutEvent[] = [];
      await buildCapsulePdfBytes({ archive, photos, layout });
      assertNoTextPhotoOverlap(layout, theme);
    }
  });

  it("finishes one person's photos before the next name heading", async () => {
    const jpeg = await tinyJpeg();
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        letters: [
          {
            preferred_name: "Alex Rivera",
            body: "- rye bread\n- two pears\n- leftover mint",
            photos: [
              { storage_path: "g/a1.jpg", width: 12, height: 18, sort_order: 0 },
              { storage_path: "g/a2.jpg", width: 12, height: 18, sort_order: 1 },
              { storage_path: "g/a3.jpg", width: 12, height: 18, sort_order: 2 },
            ],
          },
          {
            preferred_name: "Jordan Lee",
            body: LONG_BODY_SNIP,
            photos: [{ storage_path: "g/j1.jpg", width: 12, height: 8, sort_order: 0 }],
          },
        ],
      }),
      photos: [
        { storage_path: "g/a1.jpg", bytes: jpeg },
        { storage_path: "g/a2.jpg", bytes: jpeg },
        { storage_path: "g/a3.jpg", bytes: jpeg },
        { storage_path: "g/j1.jpg", bytes: jpeg },
      ],
      layout,
    });
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
    expect(CAPSULE_PDF_PRODUCER).toBe("monthly-capsule-layout/2");
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

describe("magazine pdf", () => {
  it("puts a footer with the group name and page number on every page", async () => {
    const { archive, photos } = await buildVisualArchive("magazine");
    const layout: CapsulePdfLayoutEvent[] = [];
    const bytes = await buildCapsulePdfBytes({ archive, photos, layout });
    const text = pdfExtractText(bytes);
    const pages = layout.filter((event) => event.kind === "page");
    const footers = layout.filter((event) => event.kind === "footer");
    expect(pages.length).toBeGreaterThan(1);
    expect(footers).toHaveLength(pages.length);
    expect(footers.every((event) => event.text === "Regression Kitchen")).toBe(true);
    expect(footers.map((event) => event.name)).toEqual(pages.map((event) => String(event.page)));
    expect(text).toContain("REGRESSION KITCHEN");
    expect(text).toContain("October 2026");
  });

  it("keeps leftover photos in their section and lets short letters share a page", async () => {
    const jpeg = await tinyJpeg();
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 3,
        theme: "magazine",
        letters: [
          {
            preferred_name: "Alex Rivera",
            body: "- rye bread\n- two pears\n- leftover mint",
            photos: [0, 1, 2, 3].map((index) => ({
              storage_path: `g/a${index}.jpg`,
              width: index % 2 === 0 ? 1200 : 800,
              height: index % 2 === 0 ? 800 : 1200,
              sort_order: index,
            })),
          },
          {
            preferred_name: "Morgan Blake",
            body: "The kitchen was quiet except for the pot lid.",
            photos: [],
          },
          {
            preferred_name: "Jordan Lee",
            body: "Next short note on the same page.",
            photos: [],
          },
        ],
      }),
      photos: [0, 1, 2, 3].map((index) => ({
        storage_path: `g/a${index}.jpg`,
        bytes: jpeg,
      })),
      layout,
    });
    const alex = layout.find((event) => event.kind === "heading" && event.name === "Alex Rivera");
    const morgan = layout.find((event) => event.kind === "heading" && event.name === "Morgan Blake");
    const jordan = layout.find((event) => event.kind === "heading" && event.name === "Jordan Lee");
    const alexPhotos = layout.filter(
      (event) => event.kind === "photo" && event.person === "Alex Rivera",
    );
    expect(alex).toBeTruthy();
    expect(morgan).toBeTruthy();
    expect(jordan).toBeTruthy();
    expect(alexPhotos.length).toBeGreaterThan(0);
    for (const photo of alexPhotos) {
      const beforeName =
        photo.page < morgan!.page || (photo.page === morgan!.page && (photo.bottom ?? 0) > morgan!.y);
      expect(beforeName).toBe(true);
    }
    expect(layout.some((event) => event.kind === "photo" && event.person === "Jordan Lee")).toBe(
      false,
    );
    expect(morgan!.page).toBe(jordan!.page);
    expect(source("./capsule-pdf.ts")).not.toContain("magazinePullQuote");
    expect(source("./capsule-pdf.ts")).not.toContain("maybeDrawMagazinePullQuote");
    expect(source("./capsule-pdf-magazine.ts")).not.toContain("magazinePullQuote");
  });

  it("keeps the name with its first full paragraph", async () => {
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 2,
        theme: "magazine",
        letters: [
          { preferred_name: "Casey Nguyen", body: fillerBody(4), photos: [] },
          {
            preferred_name: "Riley Chen",
            body: KEEP_TARGET_BODY,
            photos: [],
          },
        ],
      }),
      photos: [],
      layout,
    });
    const riley = layout.find((event) => event.kind === "heading" && event.name === "Riley Chen");
    const opening = layout.filter(
      (event) =>
        event.kind === "text" &&
        event.person === "Riley Chen" &&
        /^Line \d+ stays with the name heading/.test(event.text ?? ""),
    );
    expect(riley).toBeTruthy();
    expect(opening.length).toBeGreaterThanOrEqual(10);
    expect(opening.every((event) => event.page === riley!.page)).toBe(true);
    expect(source("./capsule-pdf.ts")).toContain("headingKeepWithNextNeeded");
    expect(source("./capsule-pdf.ts")).toContain("forceNewPage");
  });

  it("fills a photo-less cover with the group name, newsletter kicker, month, and contributors", async () => {
    const bytes = await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        theme: "magazine",
        letters: [{ preferred_name: "Casey Nguyen", body: "Just words.", photos: [] }],
      }),
      photos: [],
    });
    const text = pdfExtractText(bytes);
    expect(text).toContain("REGRESSION KITCHEN");
    expect(text).toContain("newsletter");
    expect(text).toContain("October 2026");
    expect(text).toContain("Contributors:");
    expect(text).toContain("Casey Nguyen");
  });

  it("renders curly quotes and does not leave an empty hero box", async () => {
    const layout: CapsulePdfLayoutEvent[] = [];
    const bytes = await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        theme: "magazine",
        letters: [{ preferred_name: "Casey Nguyen", body: "She said “hello” — it’s fine.", photos: [] }],
      }),
      photos: [],
      layout,
    });
    const text = pdfExtractText(bytes);
    expect(text).toContain("\u201c");
    expect(text).toContain("hello");
    expect(text).toContain("\u2019");
    expect(layout.filter((event) => event.kind === "photo" && event.person === "Casey Nguyen")).toEqual(
      [],
    );
    expect(source("./capsule-pdf.ts")).toContain("embedMagazineDisplayFont");
    expect(source("./capsule-pdf-fonts.ts")).toContain("Oswald-Bold.ttf");
  });

  it("uses the magazine fixtures for no-overlap and records content above the footer", async () => {
    const { archive, photos } = await buildVisualArchive("magazine");
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({ archive, photos, layout });
    const images = layout.filter((event) => event.kind === "photo" && event.height);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.bottom ?? 0).toBeGreaterThanOrEqual(MAGAZINE_CONTENT_BOTTOM - 1);
    }
    assertNoTextPhotoOverlap(layout, "magazine");
    expect(selectMagazineTemplate([{ width: 800, height: 1200 }, { width: 800, height: 1200 }])).toBe(
      "two-column",
    );
  });

  it("does not emit photo-only pages or crop a portrait letter photo to 3:2", async () => {
    const { archive, photos } = await buildVisualArchive("magazine");
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({ archive, photos, layout });
    const pages = layout.filter((event) => event.kind === "page");
    for (const page of pages) {
      const hasPhoto = layout.some((event) => event.kind === "photo" && event.page === page.page);
      const hasCopy = layout.some(
        (event) =>
          (event.kind === "text" || event.kind === "heading") && event.page === page.page,
      );
      if (hasPhoto) {
        expect(hasCopy, `page ${page.page} is photo-only`).toBe(true);
      }
    }
    const portraitJpeg = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#2f5b4c" },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const portraitLayout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        theme: "magazine",
        letters: [
          {
            preferred_name: "Jordan Lee",
            body: "All phone photos stayed portrait.",
            photos: [{ storage_path: "g/p0.jpg", width: 800, height: 1200, sort_order: 0 }],
          },
        ],
      }),
      photos: [{ storage_path: "g/p0.jpg", bytes: new Uint8Array(portraitJpeg) }],
      layout: portraitLayout,
    });
    const placed = portraitLayout.find(
      (event) => event.kind === "photo" && event.person === "Jordan Lee" && event.width && event.height,
    );
    expect(placed).toBeTruthy();
    expect((placed!.width ?? 0) / Math.max(1, placed!.height ?? 1)).toBeLessThan(1);
  });

  it("sets long-letter text in two columns on the magazine fixtures", async () => {
    const { archive, photos } = await buildVisualArchive("magazine");
    const layout: CapsulePdfLayoutEvent[] = [];
    await buildCapsulePdfBytes({ archive, photos, layout });
    const jordan = layout.filter(
      (event) =>
        event.kind === "text" &&
        event.person === "Jordan Lee" &&
        event.x != null &&
        event.width != null,
    );
    const xs = new Set(jordan.map((event) => Math.round(event.x!)));
    expect(jordan.length).toBeGreaterThan(4);
    expect(xs.size).toBeGreaterThanOrEqual(2);
  });
});

function assertNoTextPhotoOverlap(layout: CapsulePdfLayoutEvent[], theme: string) {
  const texts = layout.filter(
    (event) =>
      event.kind === "text" &&
      event.x != null &&
      event.width != null &&
      event.height != null &&
      event.person,
  );
  const images = layout.filter(
    (event) => event.kind === "photo" && event.x != null && event.width != null && event.height != null,
  );
  expect(texts.length).toBeGreaterThan(0);
  expect(images.length).toBeGreaterThan(0);
  const imagesByPage = new Map<number, typeof images>();
  for (const image of images) {
    const list = imagesByPage.get(image.page) ?? [];
    list.push(image);
    imagesByPage.set(image.page, list);
  }
  for (const line of texts) {
    for (const image of imagesByPage.get(line.page) ?? []) {
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

function stableLayoutEvent(event: CapsulePdfLayoutEvent) {
  return {
    kind: event.kind,
    page: event.page,
    y: event.y,
    name: event.name ?? null,
    person: event.person ?? null,
    text: event.text ?? null,
    x: event.x ?? null,
    width: event.width ?? null,
    bottom: event.bottom ?? null,
    height: event.height ?? null,
    storage_path: event.storage_path ?? null,
  };
}

describe("existing themes stay on the #60 layout lock", () => {
  it("classic, warm, minimal, and heritage layout events match #60 on the shared fixtures", async () => {
    const lock = JSON.parse(readFileSync(resolve(here, "capsule-pdf-layout-lock.json"), "utf8")) as Record<
      string,
      ReturnType<typeof stableLayoutEvent>[]
    >;
    for (const theme of ["classic", "warm", "minimal", "heritage"] as const) {
      const { archive, photos } = await buildVisualArchive(theme);
      const layout: CapsulePdfLayoutEvent[] = [];
      await buildCapsulePdfBytes({ archive, photos, layout });
      expect(layout.map(stableLayoutEvent), theme).toEqual(lock[theme]);
    }
    const migration = source("../../supabase/migrations/20261011120000_capsule_theme_magazine.sql");
    expect(migration).toMatch(/^\s*begin;/m);
    expect(migration).toMatch(/^\s*commit;/m);
  });
});

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
