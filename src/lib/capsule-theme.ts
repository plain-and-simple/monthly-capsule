export const CAPSULE_THEMES = ["classic", "warm", "minimal", "heritage"] as const;
export type CapsuleTheme = (typeof CAPSULE_THEMES)[number];
export const DEFAULT_CAPSULE_THEME: CapsuleTheme = "classic";

export type CapsuleThemeSwatch = {
  id: CapsuleTheme;
  name: string;
  colors: readonly [string, string, string];
};

export const CAPSULE_THEME_CATALOG: readonly CapsuleThemeSwatch[] = [
  { id: "classic", name: "Classic", colors: ["#fffdf7", "#1a1712", "#2f5b4c"] },
  { id: "warm", name: "Warm", colors: ["#f3e0c8", "#6b2e1f", "#c47a3a"] },
  { id: "minimal", name: "Minimal", colors: ["#f7f7f5", "#2b2b2b", "#b5b5b0"] },
  { id: "heritage", name: "Heritage", colors: ["#f3ead7", "#1c1710", "#8a6a32"] },
];

const THEME_SET = new Set<string>(CAPSULE_THEMES);

export function isCapsuleTheme(value: unknown): value is CapsuleTheme {
  return typeof value === "string" && THEME_SET.has(value);
}

export function parseCapsuleTheme(value: unknown): CapsuleTheme {
  return isCapsuleTheme(value) ? value : DEFAULT_CAPSULE_THEME;
}

export function parseThemeFormValue(value: unknown): CapsuleTheme | null {
  return isCapsuleTheme(value) ? value : null;
}

/** Theme shown on the owner picker. Draft first, then the action result, then group. */
export function themeFormValue(
  groupTheme: unknown,
  state: { capsule_theme?: string | null } | null,
  draft: CapsuleTheme | null,
): CapsuleTheme {
  if (draft) return draft;
  const fromState = parseThemeFormValue(state?.capsule_theme);
  if (fromState) return fromState;
  return parseCapsuleTheme(groupTheme);
}

export function capsuleThemeMeta(theme: CapsuleTheme): CapsuleThemeSwatch {
  return CAPSULE_THEME_CATALOG.find((row) => row.id === theme) ?? CAPSULE_THEME_CATALOG[0]!;
}

export type LetterPhotoLayout = "grid" | "weave" | "strip" | "plates";

export const THEME_PHOTO_LAYOUT: Record<CapsuleTheme, LetterPhotoLayout> = {
  classic: "grid",
  warm: "weave",
  minimal: "strip",
  heritage: "plates",
};

export type ThemePhoto = {
  storage_path: string;
  width: number;
  height: number;
  sort_order: number;
};

export type LetterBlock =
  | { kind: "heading"; name: string }
  | { kind: "text"; text: string }
  | { kind: "photo"; photo: ThemePhoto; variant: "weave" | "plate"; plateIndex?: number }
  | { kind: "gallery"; photos: ThemePhoto[]; variant: "grid" | "strip" };

export function letterParagraphs(body: string): string[] {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [normalized];
}

export function plateLabel(index: number): string {
  return `Plate ${toRoman(index + 1)}`;
}

function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.max(1, Math.floor(value));
  let out = "";
  for (const [n, glyph] of numerals) {
    while (remaining >= n) {
      out += glyph;
      remaining -= n;
    }
  }
  return out;
}

export function weaveLetterBlocks(
  paragraphs: string[],
  photos: ThemePhoto[],
): Array<Extract<LetterBlock, { kind: "text" } | { kind: "photo" }>> {
  if (photos.length === 0) {
    return paragraphs.map((text) => ({ kind: "text" as const, text }));
  }
  if (paragraphs.length === 0) {
    return photos.map((photo) => ({ kind: "photo" as const, photo, variant: "weave" as const }));
  }

  const blocks: Array<Extract<LetterBlock, { kind: "text" } | { kind: "photo" }>> = [];
  let photoIndex = 0;
  paragraphs.forEach((text, index) => {
    blocks.push({ kind: "text", text });
    const expected = Math.floor(((index + 1) * photos.length) / paragraphs.length);
    while (photoIndex < expected && photoIndex < photos.length) {
      blocks.push({
        kind: "photo",
        photo: photos[photoIndex]!,
        variant: "weave",
      });
      photoIndex += 1;
    }
  });
  while (photoIndex < photos.length) {
    blocks.push({
      kind: "photo",
      photo: photos[photoIndex]!,
      variant: "weave",
    });
    photoIndex += 1;
  }

  return blocks;
}

export function layoutPersonSection(
  theme: CapsuleTheme,
  letter: { preferred_name: string; body: string; photos: ThemePhoto[] },
): LetterBlock[] {
  const heading: LetterBlock = { kind: "heading", name: letter.preferred_name };
  const paragraphs = letterParagraphs(letter.body);
  const photos = letter.photos;
  const layout = THEME_PHOTO_LAYOUT[theme];

  if (layout === "weave") {
    return [heading, ...weaveLetterBlocks(paragraphs, photos)];
  }

  const textBlocks: LetterBlock[] = paragraphs.map((text) => ({ kind: "text", text }));
  if (layout === "strip") {
    const gallery: LetterBlock[] =
      photos.length > 0 ? [{ kind: "gallery", photos, variant: "strip" }] : [];
    return [heading, ...textBlocks, ...gallery];
  }
  if (layout === "plates") {
    const plates: LetterBlock[] = photos.map((photo, index) => ({
      kind: "photo",
      photo,
      variant: "plate",
      plateIndex: index,
    }));
    return [heading, ...textBlocks, ...plates];
  }

  const gallery: LetterBlock[] =
    photos.length > 0 ? [{ kind: "gallery", photos, variant: "grid" }] : [];
  return [heading, ...textBlocks, ...gallery];
}

export function layoutCapsuleSections(
  theme: CapsuleTheme,
  letters: readonly { preferred_name: string; body: string; photos: ThemePhoto[] }[],
): LetterBlock[][] {
  return letters.map((letter) => layoutPersonSection(theme, letter));
}
