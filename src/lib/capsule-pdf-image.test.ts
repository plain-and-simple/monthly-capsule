import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { placeCrop, type PlacedPhoto } from "./capsule-b2";
import {
  cropWindow,
  isBaselineJpeg,
  PDF_PHOTO_MAX_PPI,
  PDF_PHOTO_MIN_PPI,
  PDF_PHOTO_TARGET_PPI,
  placedOutputSize,
  preparePlacedPhotoJpeg,
} from "./capsule-pdf-image";
import { createPdfBuildTiming, logPdfServerTiming } from "./capsule-pdf";

function placed(partial: Partial<PlacedPhoto> & Pick<PlacedPhoto, "w" | "h" | "crop" | "fit">): PlacedPhoto {
  return {
    storagePath: partial.storagePath ?? "fixture/photo.jpg",
    x: 0,
    y: 0,
    lead: false,
    ...partial,
  };
}

const ZERO = { l: 0, r: 0, t: 0, b: 0, posX: 0.5, posY: 0.5, letterbox: false, maxSide: 0 };

async function solid(width: number, height: number, paint: (x: number, y: number, pixel: Buffer, offset: number) => void) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) paint(x, y, raw, (y * width + x) * 3);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function sample(jpeg: Uint8Array, xRatio: number, yRatio: number) {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(info.width - 1, Math.max(0, Math.round((info.width - 1) * xRatio)));
  const y = Math.min(info.height - 1, Math.max(0, Math.round((info.height - 1) * yRatio)));
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset] ?? 0, g: data[offset + 1] ?? 0, b: data[offset + 2] ?? 0, width: info.width, height: info.height };
}

describe("placed photo prep", () => {
  it("sizes a print box to 200 ppi, caps at 220, and does not upscale", () => {
    const twoInches = 144;
    const large = placedOutputSize(2000, 2000, twoInches, twoInches);
    expect(large.width).toBe(twoInches / 72 * PDF_PHOTO_TARGET_PPI);
    expect(large.effectivePpi).toBeLessThanOrEqual(PDF_PHOTO_MAX_PPI);
    expect(large.lowRes).toBe(false);

    const nearCap = placedOutputSize(420, 420, twoInches, twoInches);
    expect(nearCap.width).toBeGreaterThanOrEqual(410);
    expect(nearCap.width).toBeLessThanOrEqual(Math.floor(2 * PDF_PHOTO_MAX_PPI));
    expect(nearCap.lowRes).toBe(false);

    const tiny = placedOutputSize(40, 40, twoInches, twoInches);
    expect(tiny.width).toBeLessThanOrEqual(40);
    expect(tiny.height).toBeLessThanOrEqual(40);
    expect(tiny.effectivePpi).toBeLessThan(PDF_PHOTO_MIN_PPI);
    expect(tiny.lowRes).toBe(true);
  });

  it("keeps the face-aware window instead of a centred trim", async () => {
    const width = 400;
    const height = 300;
    const bytes = await solid(width, height, (x, _y, pixel, offset) => {
      const blue = x >= width * 0.9;
      pixel[offset] = blue ? 20 : 210;
      pixel[offset + 1] = 30;
      pixel[offset + 2] = blue ? 210 : 30;
    });
    const source = { width, height, faces: [{ x: 0.02, y: 0.3, w: 0.2, h: 0.4 }] };
    const crop = placeCrop(source, (width / height) * 0.92);
    expect(crop.letterbox).toBe(false);
    expect(crop.l).toBeLessThan(crop.r);

    const slotW = 72;
    const slotH = slotW / ((width / height) * 0.92);
    const prepared = await preparePlacedPhotoJpeg(
      bytes,
      placed({ w: slotW, h: slotH, crop, fit: "cover" }),
    );
    expect(prepared).not.toBeNull();
    expect(prepared!.lowRes).toBe(false);
    expect(isBaselineJpeg(prepared!.jpeg)).toBe(true);
    const pixel = await sample(prepared!.jpeg, 0.96, 0.5);
    expect(pixel.r).toBeGreaterThan(pixel.b + 40);

    const window = cropWindow(width, height, crop);
    expect(window.left).toBe(Math.round(crop.l * width));
    expect(window.width).toBeLessThan(width);
  });

  it("letterboxes the whole frame when the slot cannot be cropped", async () => {
    const bytes = await solid(400, 100, (_x, _y, pixel, offset) => {
      pixel[offset] = 180;
      pixel[offset + 1] = 40;
      pixel[offset + 2] = 40;
    });
    const prepared = await preparePlacedPhotoJpeg(
      bytes,
      placed({
        w: 200,
        h: 200,
        crop: { ...ZERO, letterbox: true },
        fit: "contain",
      }),
    );
    expect(prepared).not.toBeNull();
    expect(prepared!.width).toBeCloseTo(1, 2);
    expect(prepared!.height).toBeCloseTo(0.25, 2);
    expect(prepared!.top).toBeGreaterThan(0.3);
    expect(prepared!.left).toBeCloseTo(0, 2);
    const meta = await sharp(prepared!.jpeg).metadata();
    expect(meta.width).toBeLessThanOrEqual(400);
    expect(meta.height).toBeLessThanOrEqual(100);
    expect((meta.height ?? 1) / (meta.width ?? 1)).toBeCloseTo(0.25, 1);
  });

  it("applies EXIF rotation and converts pixels to sRGB without upscaling a small source", async () => {
    const wide = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "#c04040" },
    })
      .jpeg({ quality: 90, progressive: false })
      .toBuffer();
    const turned = await sharp(wide).withMetadata({ orientation: 6 }).toBuffer();
    const stored = await sharp(turned).metadata();
    expect(stored.orientation).toBe(6);
    expect(stored.width).toBe(80);
    expect(stored.height).toBe(40);

    const prepared = await preparePlacedPhotoJpeg(
      turned,
      placed({ w: 72, h: 144, crop: { ...ZERO }, fit: "cover", storagePath: "fixture/turned.jpg" }),
    );
    expect(prepared).not.toBeNull();
    expect(prepared!.lowRes).toBe(true);
    const oriented = await sharp(prepared!.jpeg).metadata();
    expect(oriented.width).toBe(40);
    expect(oriented.height).toBe(80);
    expect(oriented.space).toBe("srgb");
    expect(isBaselineJpeg(prepared!.jpeg)).toBe(true);

    const foreign = await sharp({
      create: { width: 48, height: 48, channels: 3, background: "#2266aa" },
    })
      .toColorspace("cmyk")
      .jpeg()
      .toBuffer();
    expect((await sharp(foreign).metadata()).space).toBe("cmyk");
    const converted = await preparePlacedPhotoJpeg(
      foreign,
      placed({ w: 72, h: 72, crop: { ...ZERO }, fit: "cover", storagePath: "fixture/ink.jpg" }),
    );
    expect((await sharp(converted!.jpeg).metadata()).space).toBe("srgb");
  });

  it("logs low-res photos on the server-timing line", () => {
    const timing = createPdfBuildTiming();
    timing.prepMs = 12.5;
    timing.launchMs = 4;
    timing.renderMs = 80;
    timing.uploadMs = 3;
    timing.warnings.push({ storagePath: "fixture/tiny.jpg", effectivePpi: 42.2 });
    const lines: string[] = [];
    const info = console.info;
    const warn = console.warn;
    console.info = (line?: unknown) => {
      lines.push(String(line));
    };
    console.warn = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      logPdfServerTiming(timing);
    } finally {
      console.info = info;
      console.warn = warn;
    }
    expect(lines[0]).toContain("server-timing prep;dur=12.5, launch;dur=4.0, render;dur=80.0, upload;dur=3.0");
    expect(lines[0]).toContain("lowres;dur=1");
    expect(lines[1]).toContain("fixture/tiny.jpg");
    expect(lines[1]).toContain("42.2");
  });
});
