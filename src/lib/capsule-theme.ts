export const CAPSULE_THEMES = ["classic", "warm", "minimal", "heritage", "magazine"] as const;
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
  { id: "magazine", name: "Magazine", colors: ["#f6f1e8", "#1c1916", "#c43b2e"] },
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

export type LetterPhotoLayout = "grid" | "strip" | "plates";

/** Extra photos after the writing. In-flow photos weave beside paragraphs on every theme. */
export const THEME_PHOTO_LAYOUT: Record<CapsuleTheme, LetterPhotoLayout> = {
  classic: "grid",
  warm: "grid",
  minimal: "strip",
  heritage: "plates",
  magazine: "grid",
};

export type ThemePhoto = {
  storage_path: string;
  width: number;
  height: number;
  sort_order: number;
};

export type WeaveSide = "left" | "right";

export type LetterBlock =
  | { kind: "heading"; name: string }
  | { kind: "text"; text: string }
  | { kind: "photo"; photo: ThemePhoto; variant: "weave"; side: WeaveSide }
  | { kind: "photo"; photo: ThemePhoto; variant: "plate"; plateIndex?: number }
  | { kind: "gallery"; photos: ThemePhoto[]; variant: "grid" | "strip" };

export function weavePhotoSide(index: number): WeaveSide {
  return index % 2 === 0 ? "right" : "left";
}

const SHORT_LINE_MAX = 80;

export function isShortSingleLine(text: string): boolean {
  if (!text || text.includes("\n")) return false;
  if (/^[-*•–—]\s*\S/.test(text) || /^\d+[.)]\s+\S/.test(text)) return true;
  return text.length <= SHORT_LINE_MAX;
}

function mergeConsecutiveShortLines(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    const prevTail = prev?.split("\n").at(-1) ?? "";
    if (prev != null && isShortSingleLine(prevTail) && isShortSingleLine(part)) {
      out[out.length - 1] = `${prev}\n${part}`;
    } else {
      out.push(part);
    }
  }
  return out;
}

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
  if (lines.length <= 1) return lines.length > 0 ? lines : [normalized];
  return mergeConsecutiveShortLines(lines);
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
): Array<
  | Extract<LetterBlock, { kind: "text" }>
  | Extract<LetterBlock, { kind: "photo"; variant: "weave" }>
> {
  if (paragraphs.length === 0) return [];
  if (photos.length === 0) {
    return paragraphs.map((text) => ({ kind: "text" as const, text }));
  }

  const blocks: Array<
    | Extract<LetterBlock, { kind: "text" }>
    | Extract<LetterBlock, { kind: "photo"; variant: "weave" }>
  > = [];
  let photoIndex = 0;
  paragraphs.forEach((text, index) => {
    const expected = Math.floor(((index + 1) * photos.length) / paragraphs.length);
    if (photoIndex < expected && photoIndex < photos.length) {
      blocks.push({
        kind: "photo",
        photo: photos[photoIndex]!,
        variant: "weave",
        side: weavePhotoSide(photoIndex),
      });
      photoIndex += 1;
    }
    blocks.push({ kind: "text", text });
  });

  return blocks;
}

export type LetterRun = {
  kind: "run";
  photo: Extract<LetterBlock, { kind: "photo"; variant: "weave" }>;
  text: string;
};

export function groupWovenRuns(blocks: LetterBlock[]): Array<LetterBlock | LetterRun> {
  const out: Array<LetterBlock | LetterRun> = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const next = blocks[i + 1];
    if (block.kind === "photo" && block.variant === "weave" && next?.kind === "text") {
      out.push({ kind: "run", photo: block, text: next.text });
      i += 1;
      continue;
    }
    out.push(block);
  }
  return out;
}

export function leftoverPhotoBlocks(theme: CapsuleTheme, photos: ThemePhoto[]): LetterBlock[] {
  if (photos.length === 0) return [];
  const layout = THEME_PHOTO_LAYOUT[theme];
  if (layout === "plates") {
    return photos.map((photo, index) => ({
      kind: "photo" as const,
      photo,
      variant: "plate" as const,
      plateIndex: index,
    }));
  }
  return [{ kind: "gallery", photos, variant: layout }];
}

export function layoutPersonSection(
  theme: CapsuleTheme,
  letter: { preferred_name: string; body: string; photos: ThemePhoto[] },
): LetterBlock[] {
  const heading: LetterBlock = { kind: "heading", name: letter.preferred_name };
  const paragraphs = letterParagraphs(letter.body);
  const photos = letter.photos;
  const besideCount = Math.min(photos.length, paragraphs.length);
  return [
    heading,
    ...weaveLetterBlocks(paragraphs, photos.slice(0, besideCount)),
    ...leftoverPhotoBlocks(theme, photos.slice(besideCount)),
  ];
}

export function layoutCapsuleSections(
  theme: CapsuleTheme,
  letters: readonly { preferred_name: string; body: string; photos: ThemePhoto[] }[],
): LetterBlock[][] {
  return letters.map((letter) => layoutPersonSection(theme, letter));
}
