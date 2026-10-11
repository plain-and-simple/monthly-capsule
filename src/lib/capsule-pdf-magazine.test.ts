import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  cropJpegToAspect,
  magazineCoverHero,
  magazineHeroAspect,
  magazinePullQuote,
  MAGAZINE_HERO_16_9,
  MAGAZINE_HERO_3_2,
  MAGAZINE_PULL_QUOTE_MAX,
  selectMagazineTemplate,
} from "./capsule-pdf-magazine";

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
    ).toBe("hero-text-grid");
    expect(
      selectMagazineTemplate([
        { width: 1400, height: 900 },
        { width: 1200, height: 800 },
        { width: 1100, height: 700 },
        { width: 900, height: 1400 },
        { width: 800, height: 1200 },
      ]),
    ).toBe("hero-text-grid");
  });
});

describe("magazine cover hero and pull quote", () => {
  it("uses the first photo of the earliest letter that has one", () => {
    expect(
      magazineCoverHero([
        { photos: [] },
        {
          photos: [
            { storage_path: "late.jpg", width: 10, height: 10, sort_order: 0 },
          ],
        },
      ])?.storage_path,
    ).toBe("late.jpg");
    expect(
      magazineCoverHero([
        {
          photos: [
            { storage_path: "second.jpg", width: 10, height: 10, sort_order: 1 },
            { storage_path: "first.jpg", width: 10, height: 10, sort_order: 0 },
          ],
        },
      ])?.storage_path,
    ).toBe("first.jpg");
    expect(magazineCoverHero([{ photos: [] }])).toBeNull();
  });

  it("uses the first short sentence as a pull quote and skips long ones", () => {
    expect(magazinePullQuote("Short opener. Then more.")).toBe("Short opener.");
    expect(magazinePullQuote("No stop")).toBeNull();
    expect(magazinePullQuote("A".repeat(MAGAZINE_PULL_QUOTE_MAX + 1) + ".")).toBeNull();
    expect(magazinePullQuote("")).toBeNull();
  });

  it("picks 16:9 or 3:2 by whichever is closer to the photo", () => {
    expect(magazineHeroAspect(1600, 900)).toBe(MAGAZINE_HERO_16_9);
    expect(magazineHeroAspect(1500, 1000)).toBe(MAGAZINE_HERO_3_2);
    expect(magazineHeroAspect(800, 1200)).toBe(MAGAZINE_HERO_3_2);
  });

  it("center-crops without stretching", async () => {
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
});
