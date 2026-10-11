import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  cropJpegToAspect,
  cropRectForAspect,
  magazineCoverPhotos,
  magazineHeroAspect,
  MAGAZINE_CROP_FACE_BIAS,
  MAGAZINE_HERO_16_9,
  MAGAZINE_HERO_3_2,
  magazineUsesTwoTextColumns,
  planMagazinePerson,
  selectMagazineTemplate,
} from "./capsule-pdf-magazine";
import { LONG_BODY, ONE_LINE_BODY } from "./capsule-pdf-fixtures";

describe("magazine template selection", () => {
  it("picks a deterministic template from photo count and orientation", () => {
    expect(selectMagazineTemplate([])).toBe("single-or-text");
    expect(selectMagazineTemplate([{ width: 1200, height: 800 }])).toBe("single-or-text");
    expect(
      selectMagazineTemplate([
        { width: 800, height: 1300 },
        { width: 900, height: 1400 },
      ]),
    ).toBe("two-column");
    expect(
      selectMagazineTemplate([
        { width: 1400, height: 900 },
        { width: 900, height: 1300 },
      ]),
    ).toBe("hero-side-stack");
    expect(
      selectMagazineTemplate([
        { width: 1400, height: 900 },
        { width: 800, height: 1200 },
        { width: 900, height: 1400 },
      ]),
    ).toBe("hero-side-stack");
    expect(
      selectMagazineTemplate([
        { width: 1400, height: 900 },
        { width: 1200, height: 800 },
        { width: 1100, height: 700 },
      ]),
    ).toBe("hero-inline");
    expect(
      planMagazinePerson([
        { width: 1400, height: 900 },
        { width: 1200, height: 800 },
        { width: 1100, height: 700 },
        { width: 900, height: 1400 },
        { width: 800, height: 1200 },
        { width: 850, height: 1250 },
        { width: 820, height: 1280 },
      ]).template,
    ).toBe("hero-text-grid");
  });

  it("uses the first landscape as the person hero and a portrait column when there is none", () => {
    const mixed = planMagazinePerson([
      { width: 800, height: 1200, storage_path: "p0" },
      { width: 1400, height: 900, storage_path: "l1" },
      { width: 900, height: 1400, storage_path: "p2" },
    ]);
    expect(mixed.hero).toMatchObject({ storage_path: "l1" });
    expect(mixed.columnPhoto).toBeNull();
    const portraits = planMagazinePerson([
      { width: 800, height: 1200, storage_path: "p0" },
      { width: 900, height: 1400, storage_path: "p1" },
    ]);
    expect(portraits.hero).toBeNull();
    expect(portraits.columnPhoto).toMatchObject({ storage_path: "p0" });
    expect(portraits.template).toBe("two-column");
  });

  it("keeps extras inline unless there are more than about five leftover photos", () => {
    const fiveExtra = planMagazinePerson([
      { width: 1400, height: 900 },
      { width: 800, height: 1200 },
      { width: 850, height: 1250 },
      { width: 900, height: 1400 },
      { width: 750, height: 1200 },
      { width: 820, height: 1280 },
    ]);
    expect(fiveExtra.grid).toEqual([]);
    expect(fiveExtra.inline).toHaveLength(5);
    const sixExtra = planMagazinePerson([
      { width: 1400, height: 900 },
      ...Array.from({ length: 6 }, () => ({ width: 800, height: 1200 })),
    ]);
    expect(sixExtra.template).toBe("hero-text-grid");
    expect(sixExtra.inline).toHaveLength(3);
    expect(sixExtra.grid.length).toBeGreaterThan(0);
  });
});

describe("magazine cover, hero crop, and text density", () => {
  it("uses leftover photos for the cover instead of any person's hero", () => {
    expect(
      magazineCoverPhotos([
        { photos: [] },
        {
          photos: [
            { storage_path: "late.jpg", width: 10, height: 10, sort_order: 0 },
          ],
        },
      ]).map((photo) => photo.storage_path),
    ).toEqual(["late.jpg"]);
    expect(
      magazineCoverPhotos([
        {
          photos: [
            { storage_path: "hero.jpg", width: 1400, height: 900, sort_order: 0 },
            { storage_path: "extra.jpg", width: 800, height: 1200, sort_order: 1 },
          ],
        },
      ]).map((photo) => photo.storage_path),
    ).toEqual(["extra.jpg"]);
    expect(
      magazineCoverPhotos([
        {
          photos: [
            { storage_path: "a.jpg", width: 800, height: 1200, sort_order: 1 },
            { storage_path: "b.jpg", width: 800, height: 1200, sort_order: 0 },
            { storage_path: "c.jpg", width: 800, height: 1200, sort_order: 2 },
          ],
        },
      ]).map((photo) => photo.storage_path),
    ).toEqual(["a.jpg"]);
    const collage = magazineCoverPhotos([
      {
        photos: [
          { storage_path: "h.jpg", width: 1400, height: 900, sort_order: 0 },
          { storage_path: "u1.jpg", width: 800, height: 1200, sort_order: 1 },
          { storage_path: "u2.jpg", width: 800, height: 1200, sort_order: 2 },
          { storage_path: "u3.jpg", width: 800, height: 1200, sort_order: 3 },
        ],
      },
    ]);
    expect(collage.map((photo) => photo.storage_path)).toEqual(["u1.jpg", "u2.jpg", "u3.jpg"]);
    expect(magazineCoverPhotos([{ photos: [] }])).toEqual([]);
  });

  it("does not crop portraits to 3:2 and only assigns a hero aspect to landscapes", () => {
    expect(magazineHeroAspect(1600, 900)).toBe(MAGAZINE_HERO_16_9);
    expect(magazineHeroAspect(1500, 1000)).toBe(MAGAZINE_HERO_3_2);
    expect(magazineHeroAspect(800, 1200)).toBeNull();
  });

  it("biases a taller crop toward the upper-middle instead of dead center", () => {
    const rect = cropRectForAspect(1200, 1000, MAGAZINE_HERO_16_9);
    const slack = 1000 - rect.height;
    expect(rect.top).toBe(Math.round(slack * MAGAZINE_CROP_FACE_BIAS));
    expect(rect.top).toBeLessThan(slack / 2);
  });

  it("crops without stretching and keeps the requested aspect", async () => {
    const bytes = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#c43b2e" },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const cropped = await cropJpegToAspect(new Uint8Array(bytes), MAGAZINE_HERO_16_9);
    expect(cropped).not.toBeNull();
    const meta = await sharp(cropped!).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(meta.width! / meta.height!).toBeCloseTo(MAGAZINE_HERO_16_9, 2);
  });

  it("marks long letters for two text columns and leaves one-liners single-column", () => {
    expect(magazineUsesTwoTextColumns(LONG_BODY)).toBe(true);
    expect(magazineUsesTwoTextColumns(ONE_LINE_BODY)).toBe(false);
    expect(magazineUsesTwoTextColumns("- rye bread from the Saturday stall")).toBe(false);
  });
});
