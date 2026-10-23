import { describe, expect, it } from "vitest";
import {
  B2_CONTENT_BOTTOM,
  B2_INNER_W,
  B2_INNER_X,
  B2_PAGE_W,
  B2_TEMPLATE_IDS,
  HEADER_STYLES,
  MAX_TRIM,
  SPREAD_WORD_MIN,
  TEMPLATE_REPEAT_PENALTY,
  auditPageContent,
  faceFullyVisible,
  heroScore,
  layoutCapsuleDocument,
  magazineRowCounts,
  measureTextWidth,
  orderPhotos,
  parseFaceBoxes,
  parsePhotoFacesList,
  placeCrop,
  scoreCandidate,
  wordCount,
  type B2Photo,
  type PagePlan,
} from "./capsule-b2";
import { capsuleThemeMeta, type CapsuleTheme } from "./capsule-theme";

function photo(
  id: string,
  width: number,
  height: number,
  faces: B2Photo["faces"] = [],
  order = 0,
): B2Photo {
  return { storagePath: id, width, height, faces, order };
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function bodyWords(pages: PagePlan[]): string[] {
  return words(
    pages
      .flatMap((page) => page.lines.filter((line) => line.role === "body").map((line) => line.text))
      .join(" "),
  );
}

function personPages(plan: { pages: PagePlan[] }, name: string): PagePlan[] {
  return plan.pages.filter((page) => page.personName === name);
}

function layout(letters: Array<{ name?: string; body: string; photos?: B2Photo[] }>, theme: CapsuleTheme = "classic") {
  return layoutCapsuleDocument({
    groupName: "Cedar Street",
    monthLabel: "October 2026",
    theme,
    missedLine: "",
    contributors: letters.length ? `Contributors: ${letters.map((letter) => letter.name ?? "Wren").join(", ")}` : "",
    letters: letters.map((letter, index) => ({
      preferredName: letter.name ?? "Wren",
      body: letter.body,
      photos: letter.photos ?? [],
    })),
  });
}

function expectClean(pages: PagePlan[]) {
  for (const page of pages) {
    expect(auditPageContent(page), page.templateId).toEqual([]);
    for (const line of page.lines) {
      if (line.role === "footer") continue;
      const inkWidth = measureTextWidth(line.text, line.size, line.font);
      expect(inkWidth).toBeLessThanOrEqual(line.w + 0.6);
      expect(line.x).toBeGreaterThanOrEqual(-1);
      expect(line.x + line.w).toBeLessThanOrEqual(B2_PAGE_W + 1);
    }
    for (const placed of page.photos) {
      expect(placed.crop.maxSide).toBeLessThanOrEqual(MAX_TRIM + 0.002);
      const source = pages
        .flatMap((item) => item.photos)
        .find((item) => item.storagePath === placed.storagePath);
      expect(source).toBeTruthy();
    }
  }
}

function expectFacesKept(pages: PagePlan[], photos: B2Photo[]) {
  for (const page of pages) {
    for (const placed of page.photos) {
      const source = photos.find((item) => item.storagePath === placed.storagePath);
      expect(source).toBeTruthy();
      for (const face of source!.faces) {
        if (face.w * face.h < 0.003) continue;
        expect(faceFullyVisible(face, placed.crop), placed.storagePath).toBe(true);
      }
      if (placed.crop.letterbox || placed.fit === "contain") {
        expect(placed.crop.maxSide).toBe(0);
      }
    }
  }
}

function expectPhotosOnce(pages: PagePlan[], photos: B2Photo[]) {
  const seen = pages.flatMap((page) => page.photos.map((photo) => photo.storagePath));
  expect(seen.slice().sort()).toEqual(photos.map((item) => item.storagePath).sort());
}

const LETTER = "The plum tree finally did something this year after we almost gave up on it. A second thought about the porch light.";

describe("b2 scorer and crops", () => {
  it("lists 14 scored templates and cycles header styles", () => {
    expect(B2_TEMPLATE_IDS).toHaveLength(14);
    expect(new Set(B2_TEMPLATE_IDS).size).toBe(14);
    expect(HEADER_STYLES).toEqual(["rule", "block", "serif"]);
  });

  it("penalizes repeating the previous template and prefers a person lead", () => {
    const base = {
      blankRatio: 0.1,
      fontSize: 13,
      meanCrop: 0.02,
      heroIsLargest: true,
      objectIsBiggest: false,
      hasPerson: true,
      templateId: "duo",
      affinity: 1,
    };
    const fresh = scoreCandidate({ ...base, previousTemplateId: null });
    const repeat = scoreCandidate({ ...base, previousTemplateId: "duo" });
    expect(fresh - repeat).toBeCloseTo(TEMPLATE_REPEAT_PENALTY, 5);
    const objectLead = scoreCandidate({
      ...base,
      previousTemplateId: null,
      objectIsBiggest: true,
      heroIsLargest: false,
    });
    expect(fresh).toBeGreaterThan(objectLead);

    const person = photo("person", 800, 1200, [{ x: 0.3, y: 0.2, w: 0.3, h: 0.3 }], 1);
    const object = photo("object", 1600, 900, [], 0);
    expect(heroScore(person)).toBeGreaterThan(heroScore(object));
    expect(orderPhotos([object, person])[0]?.storagePath).toBe("person");
    const tiny = photo("speck", 800, 800, [{ x: 0.1, y: 0.1, w: 0.04, h: 0.04 }]);
    expect(heroScore(tiny)).toBeLessThan(heroScore(object) + 0.01);
  });

  it("trims at most 10% per side and never cuts a face", () => {
    const plain = photo("plain", 1000, 800);
    const wider = placeCrop(plain, plain.width / plain.height * 0.86);
    expect(wider.letterbox).toBe(false);
    expect(wider.l).toBeLessThanOrEqual(MAX_TRIM + 1e-6);
    expect(wider.r).toBeLessThanOrEqual(MAX_TRIM + 1e-6);
    expect(wider.l + wider.r).toBeGreaterThan(0.05);

    const faced = photo("faced", 1000, 800, [{ x: 0.05, y: 0.2, w: 0.4, h: 0.45 }]);
    const crop = placeCrop(faced, (faced.width / faced.height) * 0.9);
    expect(crop.maxSide).toBeLessThanOrEqual(MAX_TRIM + 1e-6);
    expect(faceFullyVisible(faced.faces[0]!, crop)).toBe(true);

    const wideFace = photo("wide", 1000, 800, [{ x: 0.02, y: 0.2, w: 0.92, h: 0.4 }]);
    const blocked = placeCrop(wideFace, (wideFace.width / wideFace.height) * 0.7);
    expect(blocked.letterbox).toBe(true);
    expect(blocked.maxSide).toBe(0);
    expect(faceFullyVisible(wideFace.faces[0]!, blocked)).toBe(true);
  });

  it("rejects garbage face boxes and reads the hidden submit list", () => {
    expect(parseFaceBoxes([{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, { x: "no" }, null])).toEqual([
      { x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
    ]);
    expect(parsePhotoFacesList(JSON.stringify([[{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }], []]))).toEqual([
      [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }],
      [],
    ]);
    expect(parsePhotoFacesList("not-json")).toEqual([]);
  });

  it("packs magazine rows without a trailing single from 4 through 8", () => {
    expect(magazineRowCounts(4)).toEqual([2, 2]);
    expect(magazineRowCounts(5)).toEqual([3, 2]);
    expect(magazineRowCounts(6)).toEqual([3, 3]);
    expect(magazineRowCounts(7)).toEqual([4, 3]);
    expect(magazineRowCounts(8)).toEqual([4, 4]);
  });
});

describe("b2 page templates", () => {
  it("gives a letter with no photos its own text page", () => {
    const plan = layout([{ body: LETTER }]);
    const pages = personPages(plan, "Wren");
    expect(pages).toHaveLength(1);
    expect(pages[0]?.templateId).toBe("text-only");
    expect(pages[0]?.photos).toHaveLength(0);
    expect(bodyWords(pages)).toEqual(words(LETTER));
    expect(pages[0]?.lines.some((line) => line.role === "footer" && line.text.includes("Cedar Street"))).toBe(true);
    expect(pages[0]?.lines.some((line) => line.role === "footer" && line.text === "2")).toBe(true);
    expectClean(plan.pages);
  });

  it("sets a one-line letter in large type", () => {
    const plan = layout([{ body: "Hello October." }]);
    const page = personPages(plan, "Wren")[0]!;
    expect(page.templateId).toBe("one-line");
    const line = page.lines.find((item) => item.role === "body")!;
    expect(line.size).toBeGreaterThanOrEqual(28);
    expect(line.text).toBe("Hello October.");
    expectClean(plan.pages);
  });

  it("places one photo, prefers a portrait slot, and keeps the letter", () => {
    const shot = photo("p", 800, 1200, [{ x: 0.3, y: 0.15, w: 0.35, h: 0.28 }]);
    const body = `${LETTER} ${LETTER} ${LETTER}`;
    const plan = layout([{ body, photos: [shot] }]);
    const page = personPages(plan, "Wren")[0]!;
    expect(page.templateId).toBe("portrait-feature");
    expectPhotosOnce(personPages(plan, "Wren"), [shot]);
    expect(page.photos[0]!.h).toBeGreaterThan(page.photos[0]!.w);
    expect(bodyWords(personPages(plan, "Wren"))).toEqual(words(body));
    expectFacesKept(personPages(plan, "Wren"), [shot]);
    expectClean(plan.pages);
  });

  it("uses a wide lead for a landscape photo", () => {
    const shot = photo("land", 1600, 900);
    const plan = layout([{ body: LETTER, photos: [shot] }]);
    const page = personPages(plan, "Wren")[0]!;
    expect(["landscape-hero", "feature-band", "announce"]).toContain(page.templateId);
    expect(page.photos[0]!.w).toBeGreaterThan(page.photos[0]!.h);
    expect(page.photos[0]!.w).toBeGreaterThan(B2_INNER_W * 0.7);
    expectPhotosOnce([page], [shot]);
    expectClean(plan.pages);
  });

  it("shows every photo for a 7-photo and an 8-photo letter", () => {
    for (const count of [7, 8]) {
      const shots = Array.from({ length: count }, (_, index) =>
        photo(`g${index}`, index % 2 === 0 ? 900 : 800, index % 2 === 0 ? 1200 : 1000, [], index),
      );
      const plan = layout([{ body: "A short note about the walk and the pictures that came home with us today.", photos: shots }]);
      const pages = personPages(plan, "Wren");
      expect(pages[0]?.templateId).toBe("gallery");
      expectPhotosOnce(pages, shots);
      expectClean(plan.pages);
    }
  });

  it("turns a 900-word letter into a two-page spread and keeps every word", () => {
    const body = Array.from({ length: 900 }, (_, index) => `word${index}`).join(" ");
    expect(wordCount(body)).toBe(900);
    expect(wordCount(body)).toBeGreaterThanOrEqual(SPREAD_WORD_MIN);
    const shots = [photo("s", 1400, 900)];
    const plan = layout([{ body, photos: shots }]);
    const pages = personPages(plan, "Wren");
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.every((page) => page.templateId === "spread")).toBe(true);
    expect(bodyWords(pages)).toEqual(words(body));
    expectPhotosOnce(pages, shots);
    const last = pages[1]!.lines.filter((line) => line.role === "body").at(-1)!;
    expect(B2_CONTENT_BOTTOM - (last.y + last.h)).toBeLessThan(90);
    expectClean(plan.pages);
  });

  it("letterboxes a phone screenshot and a panorama instead of cropping past 10%", () => {
    const phone = photo("phone", 900, 1950);
    const pano = photo("pano", 3200, 800);
    expect(phone.width / phone.height).toBeLessThan(0.5);
    expect(pano.width / pano.height).toBeGreaterThan(2.4);
    for (const shot of [phone, pano]) {
      const plan = layout([{ body: LETTER, photos: [shot] }]);
      const page = personPages(plan, "Wren")[0]!;
      expect(page.templateId).toBe("letterbox");
      const placed = page.photos[0]!;
      expect(placed.crop.maxSide).toBeLessThanOrEqual(0.002);
      const slotAspect = placed.w / placed.h;
      const realAspect = shot.width / shot.height;
      expect(slotAspect).toBeCloseTo(realAspect, 1);
      expectClean(plan.pages);
    }
  });

  it("does not repeat a close template on the next person", () => {
    const shots = Array.from({ length: 6 }, (_, index) => photo(`r${index}`, 1000, 1000, [], index));
    const plan = layout([
      { name: "Ada", body: "A short note about the walk and the six pictures that came home with us.", photos: shots },
      {
        name: "Bea",
        body: "Another short note about the walk and the six pictures that came home with us.",
        photos: shots.map((item, index) => photo(`b${index}`, 1000, 1000, [], index)),
      },
    ]);
    const ada = personPages(plan, "Ada")[0]!;
    const bea = personPages(plan, "Bea")[0]!;
    expect(ada.templateId).not.toBe(bea.templateId);
    expect(["grid-rows", "gallery"]).toContain(ada.templateId);
    expect(["grid-rows", "gallery"]).toContain(bea.templateId);
    expectClean(plan.pages);
  });

  it("varies the header on adjacent pages and maps theme colors", () => {
    const plan = layout([
      { name: "Ada", body: LETTER },
      { name: "Bea", body: LETTER },
    ]);
    expect(plan.pages.map((page) => page.headerStyle)).toEqual(["rule", "block", "serif"]);
    const classic = capsuleThemeMeta("classic");
    expect(plan.pages[0]?.paper).toBe(classic.colors[0]);
    expect(plan.pages[1]?.headerFill).toBe(classic.colors[2]);
    expect(plan.pages[0]?.lines.some((line) => line.text === "CEDAR STREET")).toBe(true);
    expect(plan.pages[0]?.lines.some((line) => line.text.includes("Contributors: Ada"))).toBe(true);

    const minimal = layout([{ body: LETTER }], "minimal");
    expect(minimal.pages[1]?.headerFill).toBe(capsuleThemeMeta("minimal").colors[1]);
    expect(minimal.pages[1]?.headerFill).not.toBe(capsuleThemeMeta("minimal").colors[2]);

    const heritage = layout([{ body: "Hello October." }], "heritage");
    expect(heritage.pages[0]?.lines.some((line) => line.text === "A keepsake")).toBe(true);

    const empty = layout([]);
    expect(empty.pages).toHaveLength(1);
    expect(empty.pages[0]?.lines.some((line) => line.text === "No letters this month.")).toBe(true);
    expectClean(plan.pages);
    expectClean(minimal.pages);
    expectClean(heritage.pages);
    expectClean(empty.pages);
  });

  it("puts each person on their own pages with no overlap and the lead on a person", () => {
    const object = photo("cup", 1600, 1000, [], 0);
    const person = photo("ada", 900, 1200, [{ x: 0.28, y: 0.12, w: 0.4, h: 0.36 }], 1);
    const plan = layout([
      { name: "Ada", body: LETTER, photos: [object, person] },
      { name: "Bea", body: "Next person writes one line only.", photos: [photo("bea", 1000, 800)] },
    ]);
    const ada = personPages(plan, "Ada");
    const bea = personPages(plan, "Bea");
    expect(ada.length).toBeGreaterThan(0);
    expect(bea.length).toBeGreaterThan(0);
    expect(ada.every((page) => page !== bea[0])).toBe(true);
    const lead = ada.flatMap((page) => page.photos).find((item) => item.lead);
    expect(lead?.storagePath).toBe("ada");
    expect(lead && ada.flatMap((page) => page.photos).every((item) => item.w * item.h <= lead.w * lead.h + 1)).toBe(true);
    expectPhotosOnce(ada, [object, person]);
    expectFacesKept(ada, [object, person]);
    for (const line of ada.flatMap((page) => page.lines).filter((line) => line.role !== "footer")) {
      expect(line.y + line.h).toBeLessThanOrEqual(B2_CONTENT_BOTTOM + 1.5);
      expect(line.x).toBeGreaterThanOrEqual(B2_INNER_X - 2);
    }
    expectClean(plan.pages);
  });
});
