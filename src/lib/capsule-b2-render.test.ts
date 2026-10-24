import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { buildCapsuleArchive } from "./capsule-archive";
import { buildCapsulePdfBytes, planCapsulePdfLayout, type CapsulePdfLayoutEvent } from "./capsule-pdf";
import { shutdownCapsuleBrowser } from "./capsule-pdf-chromium";
import { capsulePdfHasProducerMark, pdfEmbeddedFontNames } from "./capsule-pdf-fonts";

function pdfImageFilters(bytes: Uint8Array): { dct: number; flateImages: number; images: number } {
  const raw = Buffer.from(bytes).toString("latin1");
  let dct = 0;
  let flateImages = 0;
  let images = 0;
  const re = /<<(?:(?!>>)[\s\S])*?\/Subtype\s*\/Image(?:(?!>>)[\s\S])*?>>/g;
  for (const match of raw.matchAll(re)) {
    images += 1;
    const dict = match[0];
    if (/\/DCTDecode/.test(dict)) dct += 1;
    else if (/\/FlateDecode/.test(dict)) flateImages += 1;
  }
  return { dct, flateImages, images };
}

function layoutSignature(events: readonly CapsulePdfLayoutEvent[]): string {
  return events
    .map((event) =>
      [
        event.kind,
        event.page,
        event.x ?? "",
        event.y,
        event.width ?? "",
        event.height ?? "",
        event.storage_path ?? "",
        event.text ?? "",
      ].join(":"),
    )
    .join("\n");
}

async function plate(width: number, height: number, seed: number): Promise<Uint8Array> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = (i * 13 + seed) % 256;
    raw[i + 1] = (i * 7 + seed * 3) % 256;
    raw[i + 2] = (seed * 17 + (i % 251)) % 256;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 70 })
    .toBuffer();
}

function letter(body: string, photos: Array<{ storage_path: string; width: number; height: number }>) {
  return buildCapsuleArchive({
    yearMonth: "2026-10",
    groupName: "Cedar Street",
    memberCount: 1,
    theme: "classic",
    letters: [{ preferred_name: "Wren", body, photos: photos.map((photo, index) => ({ ...photo, sort_order: index })) }],
  });
}

describe("b2 chromium render", () => {
  afterAll(async () => {
    await shutdownCapsuleBrowser();
  });

  it("prints synthetic fixtures under 3 MB and records cold and warm time", async () => {
    const note = "The plum tree finally did something this year after we almost gave up on it.";
    const nineHundred = Array.from({ length: 900 }, (_, index) => `word${index}`).join(" ");
    const one = await plate(1400, 1000, 3);
    const phone = await plate(900, 1950, 9);
    const pano = await plate(2400, 700, 11);
    const eight = await Promise.all(Array.from({ length: 8 }, (_, index) => plate(1200, 900, index + 20)));

    const cases: Array<{ name: string; archive: ReturnType<typeof letter>; photos: Array<{ storage_path: string; bytes: Uint8Array }> }> = [
      { name: "zero", archive: letter(note, []), photos: [] },
      {
        name: "one",
        archive: letter(note, [{ storage_path: "g/one.jpg", width: 1400, height: 1000 }]),
        photos: [{ storage_path: "g/one.jpg", bytes: one }],
      },
      {
        name: "eight",
        archive: letter(
          "Eight pictures from the walk, and a short note so every frame still has a slot.",
          eight.map((_, index) => ({ storage_path: `g/e${index}.jpg`, width: 1200, height: 900 })),
        ),
        photos: eight.map((bytes, index) => ({ storage_path: `g/e${index}.jpg`, bytes })),
      },
      {
        name: "spread",
        archive: letter(nineHundred, [{ storage_path: "g/spread.jpg", width: 1400, height: 1000 }]),
        photos: [{ storage_path: "g/spread.jpg", bytes: one }],
      },
      {
        name: "phone",
        archive: letter(note, [{ storage_path: "g/phone.jpg", width: 900, height: 1950 }]),
        photos: [{ storage_path: "g/phone.jpg", bytes: phone }],
      },
      {
        name: "pano",
        archive: letter(note, [{ storage_path: "g/pano.jpg", width: 2400, height: 700 }]),
        photos: [{ storage_path: "g/pano.jpg", bytes: pano }],
      },
      { name: "line", archive: letter("Hello October.", []), photos: [] },
    ];

    const sizes: Record<string, number> = {};
    const started = performance.now();
    const first = await buildCapsulePdfBytes({ archive: cases[0]!.archive, photos: cases[0]!.photos });
    const coldMs = Math.round(performance.now() - started);
    sizes[cases[0]!.name] = first.length;
    expect(Buffer.from(first.subarray(0, 4)).toString("ascii")).toBe("%PDF");
    expect(capsulePdfHasProducerMark(first)).toBe(true);

    const warmStart = performance.now();
    const second = await buildCapsulePdfBytes({ archive: cases[1]!.archive, photos: cases[1]!.photos });
    const warmMs = Math.round(performance.now() - warmStart);
    sizes[cases[1]!.name] = second.length;

    for (const item of cases.slice(2)) {
      const bytes = await buildCapsulePdfBytes({ archive: item.archive, photos: item.photos });
      sizes[item.name] = bytes.length;
      expect(Buffer.from(bytes.subarray(0, 4)).toString("ascii")).toBe("%PDF");
    }

    for (const [name, size] of Object.entries(sizes)) {
      expect(size, name).toBeGreaterThan(800);
      expect(size, name).toBeLessThanOrEqual(3_000_000);
    }
    console.log(`B2_RENDER cold_ms=${coldMs} warm_ms=${warmMs}`);
    console.log(`B2_PDF ${Object.entries(sizes).map(([name, size]) => `${name}=${size}`).join(" ")}`);
    expect(coldMs).toBeLessThan(55_000);
    expect(warmMs).toBeLessThan(20_000);
  });

  it("embeds the bundled text fonts and the colour emoji font when the letter has emoji", async () => {
    const archive = letter("The plum tree finally did something this year. Hello 🎉", []);
    const bytes = await buildCapsulePdfBytes({ archive, photos: [] });
    expect(capsulePdfHasProducerMark(bytes)).toBe(true);
    const names = pdfEmbeddedFontNames(bytes).join(" | ").toLowerCase();
    expect(names).toMatch(/capsuleserif|liberationserif/);
    expect(names).toMatch(/capsuleserifbold|liberation.*bold|liberationserif-bold/);
    expect(names).toMatch(/capsuleserifitalic|liberation.*italic|liberationserif-italic/);
    expect(names).toMatch(/capsulesans|liberationsans/);
    expect(names).toMatch(/capsuleemoji|notocoloremoji|noto color emoji|noto-colemoji|colr/);
  });

  it("embeds a 30-photo fixture as JPEG under 3 MB with the same layout", async () => {
    const aspects = [
      [1400, 1000],
      [1000, 1400],
      [1600, 900],
      [900, 1600],
      [1200, 1200],
      [1500, 800],
    ] as const;
    const photos: Array<{ storage_path: string; bytes: Uint8Array }> = [];
    const letters = [];
    for (let member = 0; member < 5; member += 1) {
      const letterPhotos = [];
      for (let index = 0; index < 6; index += 1) {
        const [width, height] = aspects[index]!;
        const storage_path = `fixture/m${member}/p${index}.jpg`;
        const raw = Buffer.alloc(width * height * 3);
        const seed = member * 6 + index + 1;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 3;
            raw[i] = Math.max(0, Math.min(255, seed * 37 + Math.round((x / width) * 180)));
            raw[i + 1] = Math.max(0, Math.min(255, 40 + seed * 19 + Math.round((y / height) * 120)));
            raw[i + 2] = Math.max(0, Math.min(255, 90 + ((seed * 23 + x + y) % 40)));
          }
        }
        photos.push({
          storage_path,
          bytes: await sharp(raw, { raw: { width, height, channels: 3 } })
            .jpeg({ quality: 90, progressive: false })
            .toBuffer(),
        });
        letterPhotos.push({ storage_path, width, height, sort_order: index });
      }
      letters.push({
        preferred_name: `Member ${member + 1}`,
        body: `Synthetic note ${member + 1} about the porch light and the extra pictures from the walk.`,
        photos: letterPhotos,
      });
    }
    const archive = buildCapsuleArchive({
      yearMonth: "2026-10",
      groupName: "Fixture Group",
      memberCount: 5,
      theme: "classic",
      letters,
    });
    const before = planCapsulePdfLayout(archive);
    const again = planCapsulePdfLayout(archive);
    expect(layoutSignature(again)).toBe(layoutSignature(before));
    const layout: CapsulePdfLayoutEvent[] = [];
    const started = performance.now();
    const bytes = await buildCapsulePdfBytes({ archive, photos, layout });
    const ms = Math.round(performance.now() - started);
    expect(layoutSignature(layout)).toBe(layoutSignature(before));
    const doc = await PDFDocument.load(bytes);
    const layoutPages = Math.max(...before.map((event) => event.page));
    const placed = before.filter((event) => event.kind === "photo").length;
    const filters = pdfImageFilters(bytes);
    expect(doc.getPageCount()).toBe(layoutPages);
    expect(filters.images).toBe(placed);
    expect(filters.dct).toBe(placed);
    expect(filters.flateImages).toBe(0);
    expect(bytes.length).toBeLessThan(3_000_000);
    expect(capsulePdfHasProducerMark(bytes)).toBe(true);
    console.log(
      `B2_FIXTURE bytes=${bytes.length} ms=${ms} pages=${doc.getPageCount()} images=${filters.images} dct=${filters.dct}`,
    );
  }, 120_000);
});

