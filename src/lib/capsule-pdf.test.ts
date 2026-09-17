import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildCapsuleArchive } from "./capsule-archive";
import {
  buildCapsulePdfBytes,
  capsulePdfFilename,
  capsulePdfHref,
  capsulePdfStoragePath,
  detectImageKind,
  pdfContentDisposition,
  preparePdfJpeg,
  themePdfPalette,
} from "./capsule-pdf";
import { DOWNLOAD_PDF_LABEL } from "./copy";

const here = dirname(fileURLToPath(import.meta.url));

function source(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

function pdfExtractText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const chunks: Buffer[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    try {
      chunks.push(inflateSync(Buffer.from(match[1], "latin1")));
    } catch {
      // JPEG / already uncompressed
    }
  }
  const inflated = Buffer.concat(chunks).toString("latin1");
  return [...inflated.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((entry) => Buffer.from(entry[1]!, "hex").toString("latin1"))
    .join("\n");
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
  });

  it("email attaches a stored pdf and does not generate during send", () => {
    const email = source("./email.ts");
    expect(email).toContain("loadStoredCapsulePdf");
    expect(email).toContain("attachments");
    expect(email).not.toContain("generateAndStoreCapsulePdf");
    expect(email).not.toContain("ensureCapsulePdf");
  });
});
