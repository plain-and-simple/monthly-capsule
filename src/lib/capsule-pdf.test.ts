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
  selectEnsuredCapsulePdf,
  detectImageKind,
  pdfContentDisposition,
  preparePdfJpeg,
  themePdfPalette,
} from "./capsule-pdf";
import { CAPSULE_PDF_PRODUCER, capsulePdfHasProducerMark } from "./capsule-pdf-fonts";
import { DOWNLOAD_PDF_LABEL } from "./copy";

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
