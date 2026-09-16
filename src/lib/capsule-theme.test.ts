import { describe, expect, it } from "vitest";
import { buildCapsuleArchive, renderArchiveHtml } from "./capsule-archive";
import {
  CAPSULE_THEME_CATALOG,
  layoutCapsuleSections,
  layoutPersonSection,
  parseCapsuleTheme,
  parseThemeFormValue,
  plateLabel,
  themeFormValue,
  THEME_PHOTO_LAYOUT,
  weaveLetterBlocks,
} from "./capsule-theme";

const ada = {
  preferred_name: "Ada",
  body: "First paragraph.\n\nSecond paragraph.\n\nThird thought.",
  photos: [
    { storage_path: "g/a1.jpg", width: 800, height: 600, sort_order: 0 },
    { storage_path: "g/a2.jpg", width: 800, height: 600, sort_order: 1 },
  ],
};

const bea = {
  preferred_name: "Bea",
  body: "Only Bea wrote this.",
  photos: [{ storage_path: "g/b1.jpg", width: 640, height: 480, sort_order: 0 }],
};

describe("capsule theme selection", () => {
  it("keeps four first-party templates with swatches and names", () => {
    expect(CAPSULE_THEME_CATALOG.map((row) => row.id)).toEqual([
      "classic",
      "warm",
      "minimal",
      "heritage",
    ]);
    for (const row of CAPSULE_THEME_CATALOG) {
      expect(row.name).toMatch(/^[A-Z][a-z]+$/);
      expect(row.colors).toHaveLength(3);
      expect(row.colors[0]).toMatch(/^#/);
    }
  });

  it("persists only known theme ids and defaults the rest to classic", () => {
    expect(parseCapsuleTheme("warm")).toBe("warm");
    expect(parseCapsuleTheme("heritage")).toBe("heritage");
    expect(parseCapsuleTheme("minimal")).toBe("minimal");
    expect(parseCapsuleTheme("classic")).toBe("classic");
    expect(parseCapsuleTheme("comic-sans-scraped")).toBe("classic");
    expect(parseCapsuleTheme(null)).toBe("classic");
    expect(parseThemeFormValue("warm")).toBe("warm");
    expect(parseThemeFormValue("nope")).toBeNull();
  });

  it("theme picker prefers draft, then the action result, then the group row", () => {
    expect(themeFormValue("classic", { capsule_theme: "heritage" }, "warm")).toBe("warm");
    expect(themeFormValue("classic", { capsule_theme: "heritage" }, null)).toBe("heritage");
    expect(themeFormValue("classic", { capsule_theme: "nope" }, null)).toBe("classic");
    expect(themeFormValue("classic", null, null)).toBe("classic");
    expect(themeFormValue("minimal", null, null)).toBe("minimal");
  });
});

describe("section-per-person structure", () => {
  it("never merges two people into one section", () => {
    const sections = layoutCapsuleSections("classic", [ada, bea]);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.some((block) => block.kind === "heading" && block.name === "Ada")).toBe(
      true,
    );
    expect(sections[1]?.some((block) => block.kind === "heading" && block.name === "Bea")).toBe(
      true,
    );
    expect(sections[0]?.some((block) => block.kind === "text" && block.text.includes("Bea"))).toBe(
      false,
    );
    expect(sections[1]?.some((block) => block.kind === "text" && block.text.includes("Ada"))).toBe(
      false,
    );
  });

  it("html keeps one section per person for every theme", () => {
    for (const theme of ["classic", "warm", "minimal", "heritage"] as const) {
      const html = renderArchiveHtml({
        year_month: "2026-10",
        group_name: "Kitchen",
        theme,
        letters: [ada, bea],
      });
      expect(html).toContain(`data-theme="${theme}"`);
      expect(html.match(/<section /g)).toHaveLength(2);
      const adaAt = html.indexOf('data-author="Ada"');
      const beaAt = html.indexOf('data-author="Bea"');
      expect(adaAt).toBeGreaterThan(-1);
      expect(beaAt).toBeGreaterThan(adaAt);
      const adaChunk = html.slice(adaAt, beaAt);
      expect(adaChunk).toContain("First paragraph");
      expect(adaChunk).not.toContain("Only Bea wrote this");
      expect(html.slice(beaAt)).toContain("Only Bea wrote this");
      expect(html.slice(beaAt)).not.toContain("First paragraph");
    }
  });
});

describe("theme-owned photo vs text layout", () => {
  it("classic is letter then a photo grid", () => {
    expect(THEME_PHOTO_LAYOUT.classic).toBe("grid");
    const kinds = layoutPersonSection("classic", ada).map((block) =>
      block.kind === "gallery" ? `gallery:${block.variant}` : block.kind,
    );
    expect(kinds[0]).toBe("heading");
    expect(kinds.slice(1, -1).every((kind) => kind === "text")).toBe(true);
    expect(kinds.at(-1)).toBe("gallery:grid");
  });

  it("warm weaves photos through the writing", () => {
    expect(THEME_PHOTO_LAYOUT.warm).toBe("weave");
    const kinds = layoutPersonSection("warm", ada).map((block) => block.kind);
    expect(kinds[0]).toBe("heading");
    expect(kinds.filter((kind) => kind === "photo")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "text")).toHaveLength(3);
    const firstPhoto = kinds.indexOf("photo");
    const lastText = kinds.lastIndexOf("text");
    expect(firstPhoto).toBeGreaterThan(1);
    expect(firstPhoto).toBeLessThan(lastText);
  });

  it("minimal is text-first with a quiet strip at the end", () => {
    expect(THEME_PHOTO_LAYOUT.minimal).toBe("strip");
    const kinds = layoutPersonSection("minimal", ada).map((block) =>
      block.kind === "gallery" ? `gallery:${block.variant}` : block.kind,
    );
    expect(kinds.at(-1)).toBe("gallery:strip");
    expect(kinds.slice(1, -1).every((kind) => kind === "text")).toBe(true);
  });

  it("heritage places bordered plates after the letter", () => {
    expect(THEME_PHOTO_LAYOUT.heritage).toBe("plates");
    const blocks = layoutPersonSection("heritage", ada);
    expect(blocks.filter((block) => block.kind === "text").length).toBeGreaterThan(0);
    const plates = blocks.filter((block) => block.kind === "photo");
    expect(plates).toHaveLength(2);
    expect(plates.every((block) => block.kind === "photo" && block.variant === "plate")).toBe(true);
    expect(blocks.findIndex((block) => block.kind === "photo")).toBeGreaterThan(
      blocks.findIndex((block) => block.kind === "text"),
    );
    expect(plateLabel(0)).toBe("Plate I");
    expect(plateLabel(1)).toBe("Plate II");
  });

  it("html marks the four layouts distinctly", () => {
    const classic = renderArchiveHtml({
      year_month: "2026-10",
      group_name: "Kitchen",
      theme: "classic",
      letters: [ada],
    });
    const warm = renderArchiveHtml({
      year_month: "2026-10",
      group_name: "Kitchen",
      theme: "warm",
      letters: [ada],
    });
    const minimal = renderArchiveHtml({
      year_month: "2026-10",
      group_name: "Kitchen",
      theme: "minimal",
      letters: [ada],
    });
    const heritage = renderArchiveHtml({
      year_month: "2026-10",
      group_name: "Kitchen",
      theme: "heritage",
      letters: [ada],
    });
    expect(classic).toContain('data-layout="letter-then-photos"');
    expect(classic).toContain("letter__photos--grid");
    expect(warm).toContain('data-layout="photos-woven"');
    expect(warm).toContain("letter__photo--weave");
    expect(minimal).toContain('data-layout="text-then-strip"');
    expect(minimal).toContain("letter__photos--strip");
    expect(heritage).toContain('data-layout="letter-then-plates"');
    expect(heritage).toContain("letter__plate");
    expect(heritage).toContain("Plate I");
    expect(new Set([classic, warm, minimal, heritage]).size).toBe(4);
  });

  it("compile snapshots the selected theme onto the archive", () => {
    const snapshot = buildCapsuleArchive({
      yearMonth: "2026-10",
      groupName: "Kitchen",
      memberCount: 2,
      theme: "heritage",
      letters: [ada],
    });
    expect(snapshot.theme).toBe("heritage");
    expect(snapshot.html).toContain('data-theme="heritage"');
    expect(snapshot.html).toContain("capsule--heritage");
  });
});

describe("warm weave rhythm", () => {
  it("places a photo between writing, not only in a trailing blob", () => {
    const woven = weaveLetterBlocks(["One.", "Two.", "Three."], ada.photos);
    const kinds = woven.map((block) => block.kind);
    expect(kinds.filter((kind) => kind === "photo")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "text")).toHaveLength(3);
    expect(kinds.indexOf("photo")).toBeLessThan(kinds.lastIndexOf("text"));
    expect(kinds.join(" ")).toBe("text text photo text photo");
  });
});
