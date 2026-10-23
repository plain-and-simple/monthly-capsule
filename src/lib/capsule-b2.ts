import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDF_FONTS_DIR } from "@/lib/capsule-pdf-fonts";
import { IN_THIS_ISSUE } from "@/lib/copy";
import { capsuleThemeMeta, type CapsuleTheme } from "@/lib/capsule-theme";
import { type FaceBox } from "@/lib/face-boxes";

export { parseFaceBoxes, parsePhotoFacesList, type FaceBox } from "@/lib/face-boxes";

export type B2Photo = {
  storagePath: string;
  width: number;
  height: number;
  faces: FaceBox[];
  order: number;
};

export type Crop = {
  l: number;
  r: number;
  t: number;
  b: number;
  posX: number;
  posY: number;
  /** True when the slot cannot be reached within the trim limit, so the photo is contained instead of covered. */
  letterbox: boolean;
  maxSide: number;
};

export type PlacedPhoto = {
  storagePath: string;
  x: number;
  y: number;
  w: number;
  h: number;
  crop: Crop;
  fit: "cover" | "contain";
  lead: boolean;
};

export type FontStyle = "serif" | "serifBold" | "serifItalic" | "sans";

export type PlacedLine = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  font: FontStyle;
  color: string;
  role: "name" | "body" | "footer" | "cover";
};

export type HeaderStyle = "rule" | "block" | "serif";

export type PageBand = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
};

export type PagePlan = {
  templateId: string;
  headerStyle: HeaderStyle;
  personName: string | null;
  lines: PlacedLine[];
  photos: PlacedPhoto[];
  bands: PageBand[];
  paper: string;
  ink: string;
  accent: string;
  headerFill: string;
  headerInk: string;
};

export type DocumentPlan = { pages: PagePlan[] };

export const B2_TEMPLATE_IDS = [
  "text-only",
  "one-line",
  "announce",
  "portrait-feature",
  "landscape-hero",
  "letterbox",
  "duo",
  "side-stack",
  "hero-strip",
  "tall-mosaic",
  "grid-rows",
  "gallery",
  "feature-band",
  "spread",
] as const;

export type B2TemplateId = (typeof B2_TEMPLATE_IDS)[number];

export const B2_PAGE_W = 612;
export const B2_PAGE_H = 792;
export const B2_FOOTER_H = 30;
export const B2_MARGIN_X = 32;
export const B2_CONTENT_TOP = 26;
export const B2_HEADER_H = 44;
export const B2_GAP = 12;
export const MIN_FOOTER_GAP = 12;
export const B2_CONTENT_BOTTOM = B2_PAGE_H - B2_FOOTER_H - MIN_FOOTER_GAP;
export const B2_INNER_X = B2_MARGIN_X;
export const B2_INNER_W = B2_PAGE_W - B2_MARGIN_X * 2;
export const B2_BODY_TOP = B2_CONTENT_TOP + B2_HEADER_H + 8;
export const B2_AVAIL = B2_CONTENT_BOTTOM - B2_BODY_TOP;
export const MAX_TRIM = 0.1;
export const FACE_PAD = 0.02;
export const MIN_FACE_AREA = 0.003;
export const TEMPLATE_REPEAT_PENALTY = 2.5;
export const SPREAD_WORD_MIN = 650;
export const BLANK_PENALTY = 22;
export const LETTERBOX_PENALTY = 8;
export const HEADER_STYLES: readonly HeaderStyle[] = ["rule", "block", "serif"];
export const PAGE_UNFILLED_MAX = 0.42;
/** Body copy never goes below this. Short letters may use larger display sizes. */
export const B2_BODY_SIZE = 14;
/**
 * Cover cells with no stored face stay this close to the real aspect.
 * Older uploads have no boxes; a tiny centred trim is the whole allowance.
 */
export const COVER_UNKNOWN_TRIM = 0.03;
/** A photo block may not float with more than this fraction of the content width empty on both sides. */
export const PHOTO_SIDE_GAP_MAX = 0.08;
/**
 * `letterbox` is the only template that centres a photo inside the content width.
 * A phone screenshot or panorama keeps its real aspect; spanning the content width
 * would crop more than 10% on a side. Every other template is full width or flush
 * to one edge (text or a band occupies the other side).
 */
export const CENTRED_PHOTO_TEMPLATES: readonly string[] = ["letterbox"];

const BODY_FONTS = [B2_BODY_SIZE];
const DISPLAY_FONTS = [22, 20, 18, 16, 15, B2_BODY_SIZE];
const ONE_LINE_FONTS = [46, 40, 36, 32, 28, 24];
const ROW_GAP = 8;
/** Stretch inside a symmetric 10% trim range that lands on the photo's real aspect. */
const NATIVE_STRETCH = 0.2 / 0.45;

type FontFace = {
  unitsPerEm: number;
  glyphForCodePoint(code: number): { id: number; advanceWidth: number };
};

const fontCache = new Map<string, FontFace>();
const advanceCache = new Map<string, number>();

function loadFace(file: string): FontFace {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const create = (fontkit as unknown as { create: (bytes: Uint8Array) => FontFace }).create;
  const face = create(new Uint8Array(readFileSync(`${PDF_FONTS_DIR}/${file}`)));
  fontCache.set(file, face);
  return face;
}

function faceFor(style: FontStyle): FontFace {
  if (style === "serifBold") return loadFace("LiberationSerif-Bold.ttf");
  if (style === "serifItalic") return loadFace("LiberationSerif-Italic.ttf");
  if (style === "sans") return loadFace("LiberationSans-Regular.ttf");
  return loadFace("LiberationSerif-Regular.ttf");
}

function advanceOf(char: string, size: number, style: FontStyle): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) return 0;
  const key = `${style}:${code}:${size}`;
  const cached = advanceCache.get(key);
  if (cached != null) return cached;
  const primary = faceFor(style);
  const glyph = primary.glyphForCodePoint(code);
  let width: number;
  if (glyph.id !== 0) {
    width = (glyph.advanceWidth / primary.unitsPerEm) * size;
  } else {
    const emoji = loadFace("Noto-COLRv1.ttf");
    const alt = emoji.glyphForCodePoint(code);
    width = alt.id === 0 ? size * 0.5 : (alt.advanceWidth / emoji.unitsPerEm) * size;
  }
  advanceCache.set(key, width);
  return width;
}

export function measureTextWidth(text: string, size: number, style: FontStyle = "serif"): number {
  let width = 0;
  for (const char of text) width += advanceOf(char, size, style);
  return width;
}

export function realFaces(photo: { faces?: FaceBox[] | null }): FaceBox[] {
  return (photo.faces ?? []).filter((face) => face.w > 0 && face.h > 0 && face.w * face.h >= MIN_FACE_AREA);
}

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export function heroScore(photo: B2Photo): number {
  const faces = realFaces(photo);
  const area = faces.reduce((sum, face) => sum + face.w * face.h, 0);
  const people = faces.length
    ? 1 + Math.min(1, area * 20) + 0.05 * Math.min(faces.length, 4)
    : 0;
  const aspect = photo.width / Math.max(1, photo.height);
  return people + (aspect > 1.15 ? 0.3 : 0);
}

/** People (real-sized faces) before objects. Ties keep submit order. */
export function orderPhotos(photos: readonly B2Photo[]): B2Photo[] {
  if (photos.length === 0) return [];
  let heroIndex = 0;
  let best = -Infinity;
  photos.forEach((photo, index) => {
    const score = heroScore(photo);
    if (score > best + 1e-9) {
      best = score;
      heroIndex = index;
    }
  });
  const hero = photos[heroIndex]!;
  const rest = photos.filter((_, index) => index !== heroIndex);
  const people = rest.filter((photo) => realFaces(photo).length > 0);
  const objects = rest.filter((photo) => realFaces(photo).length === 0);
  return [hero, ...people, ...objects];
}

type Limits = { l: number; r: number; t: number; b: number };

export function sideLimits(photo: { faces?: FaceBox[] | null }): Limits {
  const faces = realFaces(photo);
  if (faces.length === 0) return { l: MAX_TRIM, r: MAX_TRIM, t: MAX_TRIM, b: MAX_TRIM };
  const x0 = Math.min(...faces.map((face) => face.x));
  const x1 = Math.max(...faces.map((face) => face.x + face.w));
  const y0 = Math.min(...faces.map((face) => face.y));
  const y1 = Math.max(...faces.map((face) => face.y + face.h));
  const cap = (value: number) => Math.max(0, Math.min(MAX_TRIM, value - FACE_PAD));
  return { l: cap(x0), r: cap(1 - x1), t: cap(y0), b: cap(1 - y1) };
}

export function aspectRange(photo: { width: number; height: number; faces?: FaceBox[] | null }): [number, number] {
  const aspect = photo.width / Math.max(1, photo.height);
  const limits = sideLimits(photo);
  return [
    aspect * Math.max(0.02, 1 - limits.l - limits.r),
    aspect / Math.max(0.02, 1 - limits.t - limits.b),
  ];
}

const ZERO_CROP: Crop = { l: 0, r: 0, t: 0, b: 0, posX: 0.5, posY: 0.5, letterbox: false, maxSide: 0 };

function letterboxCrop(): Crop {
  return { l: 0, r: 0, t: 0, b: 0, posX: 0.5, posY: 0.5, letterbox: true, maxSide: 0 };
}

export function faceFullyVisible(face: FaceBox, crop: Crop): boolean {
  const eps = 0.004;
  const x0 = crop.l;
  const x1 = 1 - crop.r;
  const y0 = crop.t;
  const y1 = 1 - crop.b;
  return face.x >= x0 - eps && face.x + face.w <= x1 + eps && face.y >= y0 - eps && face.y + face.h <= y1 + eps;
}

export function placeCrop(photo: { width: number; height: number; faces?: FaceBox[] | null }, targetAspect: number): Crop {
  const aspect = photo.width / Math.max(1, photo.height);
  const limits = sideLimits(photo);
  const [minAspect, maxAspect] = aspectRange(photo);
  if (!(targetAspect > 0) || targetAspect < minAspect - 1e-4 || targetAspect > maxAspect + 1e-4) {
    return letterboxCrop();
  }
  if (Math.abs(targetAspect - aspect) < 1e-4) return { ...ZERO_CROP };
  const faces = realFaces(photo);
  if (targetAspect < aspect) {
    const cut = 1 - targetAspect / aspect;
    if (faces.length === 0) {
      return { l: cut / 2, r: cut / 2, t: 0, b: 0, posX: 0.5, posY: 0.5, letterbox: false, maxSide: cut / 2 };
    }
    const span = 1 - cut;
    const face0 = Math.min(...faces.map((face) => face.x));
    const face1 = Math.max(...faces.map((face) => face.x + face.w));
    if (face1 - face0 > span + 1e-4) return letterboxCrop();
    const minStart = Math.max(0, 1 - span - limits.r, face1 - span);
    const maxStart = Math.min(limits.l, 1 - span, face0);
    if (minStart > maxStart + 1e-4) return letterboxCrop();
    const prefer = limits.l + limits.r > 0 ? cut * (limits.l / (limits.l + limits.r)) : cut / 2;
    const start = clamp(prefer, minStart, maxStart);
    const left = start;
    const right = cut - start;
    return {
      l: left,
      r: right,
      t: 0,
      b: 0,
      posX: cut > 1e-6 ? left / cut : 0.5,
      posY: 0.5,
      letterbox: false,
      maxSide: Math.max(left, right),
    };
  }
  const cut = 1 - aspect / targetAspect;
  if (faces.length === 0) {
    return { l: 0, r: 0, t: cut / 2, b: cut / 2, posX: 0.5, posY: 0.5, letterbox: false, maxSide: cut / 2 };
  }
  const span = 1 - cut;
  const face0 = Math.min(...faces.map((face) => face.y));
  const face1 = Math.max(...faces.map((face) => face.y + face.h));
  if (face1 - face0 > span + 1e-4) return letterboxCrop();
  const minStart = Math.max(0, 1 - span - limits.b, face1 - span);
  const maxStart = Math.min(limits.t, 1 - span, face0);
  if (minStart > maxStart + 1e-4) return letterboxCrop();
  const prefer = limits.t + limits.b > 0 ? cut * (limits.t / (limits.t + limits.b)) : cut / 2;
  const start = clamp(prefer, minStart, maxStart);
  const top = start;
  const bottom = cut - start;
  return {
    l: 0,
    r: 0,
    t: top,
    b: bottom,
    posX: 0.5,
    posY: cut > 1e-6 ? top / cut : 0.5,
    letterbox: false,
    maxSide: Math.max(top, bottom),
  };
}

export function scoreCandidate(input: {
  blankRatio: number;
  fontSize: number;
  meanCrop: number;
  heroIsLargest: boolean;
  objectIsBiggest: boolean;
  hasPerson: boolean;
  templateId: string;
  previousTemplateId: string | null;
  affinity: number;
  letterboxCount?: number;
}): number {
  let score = input.affinity;
  score -= input.blankRatio * BLANK_PENALTY;
  score -= Math.max(0, B2_BODY_SIZE - input.fontSize) * 8;
  score -= input.meanCrop * 4;
  score -= (input.letterboxCount ?? 0) * LETTERBOX_PENALTY;
  if (input.heroIsLargest) score += 1.5;
  if (input.objectIsBiggest && input.hasPerson) score -= 1.5;
  if (input.previousTemplateId && input.previousTemplateId === input.templateId) {
    score -= TEMPLATE_REPEAT_PENALTY;
  }
  return score;
}

type Token = { word: string; breakBefore: "start" | "space" | "line" | "para" };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n\n");
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lines = paragraph.split("\n");
    lines.forEach((line, lineIndex) => {
      const words = line.split(/\s+/).filter(Boolean);
      words.forEach((word, wordIndex) => {
        let breakBefore: Token["breakBefore"] = "space";
        if (tokens.length === 0) breakBefore = "start";
        else if (wordIndex === 0 && lineIndex === 0) breakBefore = "para";
        else if (wordIndex === 0) breakBefore = "line";
        tokens.push({ word, breakBefore });
      });
    });
  });
  return tokens;
}

function joinTokens(tokens: readonly Token[]): string {
  let out = "";
  for (const token of tokens) {
    if (token.breakBefore === "para" && out) out += "\n\n";
    else if (token.breakBefore === "line" && out) out += "\n";
    else if (token.breakBefore === "space" && out) out += " ";
    out += token.word;
  }
  return out;
}

function wrapParagraph(text: string, size: number, maxWidth: number, style: FontStyle): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  const pushLong = (word: string) => {
    let chunk = "";
    for (const char of word) {
      const next = chunk + char;
      if (measureTextWidth(next, size, style) <= maxWidth || chunk.length === 0) chunk = next;
      else {
        lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  };
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (measureTextWidth(trial, size, style) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    if (measureTextWidth(word, size, style) <= maxWidth) current = word;
    else pushLong(word);
  }
  if (current) lines.push(current);
  return lines;
}

function wrapBody(text: string, size: number, maxWidth: number, style: FontStyle): string[][] {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];
  return trimmed.split("\n\n").map((paragraph) => {
    const lines: string[] = [];
    for (const hard of paragraph.split("\n")) {
      const wrapped = wrapParagraph(hard, size, maxWidth, style);
      if (wrapped.length === 0) lines.push("");
      else lines.push(...wrapped);
    }
    return lines.length > 0 ? lines : [""];
  });
}

type FlowInput = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  columns: 1 | 2;
  size: number;
  fill: boolean;
  color: string;
  style?: FontStyle;
};

function flowText(input: FlowInput): { lines: PlacedLine[]; used: number } | null {
  const style = input.style ?? "serif";
  const columnGap = 16;
  const columns = input.columns;
  const columnWidth = columns === 2 ? (input.w - columnGap) / 2 : input.w;
  if (!(columnWidth > 20) || !(input.h > 0)) return null;
  const paragraphs = wrapBody(input.text, input.size, columnWidth - 1, style);
  if (paragraphs.length === 0) return { lines: [], used: 0 };
  const flat: Array<{ text: string; paraBreakBefore: boolean }> = [];
  paragraphs.forEach((lines, paragraphIndex) => {
    lines.forEach((line, lineIndex) => {
      flat.push({ text: line, paraBreakBefore: lineIndex === 0 && paragraphIndex > 0 });
    });
  });
  const placeAt = (lineHeight: number, paraGap: number) => {
    const total = flat.reduce((sum, line) => sum + lineHeight + (line.paraBreakBefore ? paraGap : 0), 0);
    const target = columns === 2 ? total / 2 : total;
    const lines: PlacedLine[] = [];
    let column = 0;
    let y = input.y;
    let columnStart = input.y;
    let bottom = input.y;
    for (const line of flat) {
      let extra = line.paraBreakBefore ? paraGap : 0;
      if (column < columns - 1 && y + extra + lineHeight - columnStart > target + 0.2 && y > columnStart) {
        column += 1;
        y = input.y;
        columnStart = input.y;
        // A paragraph gap belongs between paragraphs, not above the first line of a column.
        extra = 0;
      }
      y += extra;
      if (y + lineHeight > input.y + input.h + 0.75) return null;
      lines.push({
        text: line.text,
        x: input.x + column * (columnWidth + columnGap),
        y,
        w: columnWidth,
        h: lineHeight,
        size: input.size,
        font: style,
        color: input.color,
        role: "body",
      });
      y += lineHeight;
      bottom = Math.max(bottom, y);
    }
    return { lines, used: bottom - input.y, height: bottom - input.y };
  };
  const minLine = input.size * 1.28;
  const paraGap = input.size * 0.42;
  const minPlaced = placeAt(minLine, paraGap);
  if (!minPlaced) return null;
  if (!input.fill) return { lines: minPlaced.lines, used: minPlaced.used };
  let lo = minLine;
  let hi = input.size * 1.85;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    const placed = placeAt(mid, paraGap);
    if (placed) lo = mid;
    else hi = mid;
  }
  const placed = placeAt(lo, paraGap);
  if (!placed) return { lines: minPlaced.lines, used: minPlaced.used };
  return { lines: placed.lines, used: placed.used };
}

export function slotFitsPhoto(photo: B2Photo, slotW: number, slotH: number): boolean {
  const target = slotW / Math.max(1, slotH);
  const [minAspect, maxAspect] = aspectRange(photo);
  return target >= minAspect - 1e-4 && target <= maxAspect + 1e-4;
}

export function regionUnfilledRatio(
  photos: readonly PlacedPhoto[],
  lines: readonly PlacedLine[],
  bands: readonly PageBand[],
  top: number,
  bottom: number,
): number {
  const height = bottom - top;
  if (!(height > 1)) return 1;
  const step = 8;
  const cols = Math.max(1, Math.ceil(B2_PAGE_W / step));
  const rows = Math.max(1, Math.ceil(height / step));
  const grid = new Uint8Array(cols * rows);
  const mark = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(0, Math.floor(x / step));
    const y0 = Math.max(0, Math.floor((y - top) / step));
    const x1 = Math.min(cols, Math.ceil((x + w) / step));
    const y1 = Math.min(rows, Math.ceil((y + h - top) / step));
    for (let row = y0; row < y1; row += 1) {
      const offset = row * cols;
      for (let col = x0; col < x1; col += 1) grid[offset + col] = 1;
    }
  };
  for (const band of bands) mark(band.x, band.y, band.w, band.h);
  for (const photo of photos) mark(photo.x, photo.y, photo.w, photo.h);
  for (const line of lines) {
    mark(line.x, line.y, line.w, line.h);
  }
  let filled = 0;
  for (const cell of grid) filled += cell;
  return 1 - filled / (cols * rows);
}

export function pageUnfilledRatio(page: PagePlan): number {
  return regionUnfilledRatio(
    page.photos,
    page.lines.filter((line) => line.role !== "footer"),
    page.bands,
    page.personName ? B2_BODY_TOP : B2_CONTENT_TOP,
    B2_CONTENT_BOTTOM,
  );
}

function textHeight(text: string, size: number, width: number, columns: 1 | 2): number | null {
  if (!text.trim()) return 0;
  const flowed = flowText({
    text,
    x: 0,
    y: 0,
    w: width,
    h: 20000,
    columns,
    size,
    fill: false,
    color: "#000",
  });
  return flowed ? flowed.used : null;
}

function isOneLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("\n")) return false;
  return wordCount(trimmed) <= 12 && trimmed.length <= 80;
}

function isExtreme(photo: B2Photo): boolean {
  const aspect = photo.width / Math.max(1, photo.height);
  return aspect < 0.5 || aspect > 2.4;
}

export function magazineRowCounts(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return [count];
  if (count === 4) return [2, 2];
  if (count === 5) return [3, 2];
  if (count === 6) return [3, 3];
  if (count === 7) return [4, 3];
  if (count === 8) return [4, 4];
  const rows: number[] = [];
  let left = count;
  while (left > 4) {
    if (left === 5) {
      rows.push(3, 2);
      return rows;
    }
    rows.push(4);
    left -= 4;
  }
  if (left > 0) rows.push(left);
  return rows;
}

function aspectAt(photo: B2Photo, stretch: number): number {
  const [minAspect, maxAspect] = aspectRange(photo);
  return minAspect + (maxAspect - minAspect) * stretch;
}

type Block = { items: PlacedPhoto[]; height: number };

function rowBlock(photos: readonly B2Photo[], counts: number[], width: number, stretch: number): Block | null {
  let y = 0;
  let index = 0;
  const items: PlacedPhoto[] = [];
  for (const count of counts) {
    const slice = photos.slice(index, index + count);
    if (slice.length === 0) break;
    const aspects = slice.map((photo) => aspectAt(photo, stretch));
    const sum = aspects.reduce((total, aspect) => total + aspect, 0);
    const height = (width - ROW_GAP * (slice.length - 1)) / sum;
    if (!(height > 1) || !Number.isFinite(height)) return null;
    let x = 0;
    for (let i = 0; i < slice.length; i += 1) {
      const photo = slice[i]!;
      const boxW = aspects[i]! * height;
      const crop = placeCrop(photo, aspects[i]!);
      if (crop.letterbox || crop.maxSide > MAX_TRIM + 0.002) return null;
      items.push({
        storagePath: photo.storagePath,
        x,
        y,
        w: boxW,
        h: height,
        crop,
        fit: "cover",
        lead: false,
      });
      x += boxW + ROW_GAP;
    }
    y += height + ROW_GAP;
    index += count;
  }
  if (index < photos.length) return null;
  return { items, height: Math.max(0, y - ROW_GAP) };
}

function fitStretch(make: (stretch: number) => Block | null, budget: number): Block | null {
  const shortest = make(1);
  if (!shortest || shortest.height > budget + 0.6) return null;
  const tallest = make(0);
  if (!tallest || tallest.height <= budget + 0.6) return tallest ?? shortest;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    const block = make(mid);
    if (!block || block.height > budget) lo = mid;
    else hi = mid;
  }
  return make(hi) ?? shortest;
}

function shiftBlock(block: Block, x: number, y: number): PlacedPhoto[] {
  return block.items.map((item) => ({ ...item, x: item.x + x, y: item.y + y }));
}

function placeInSlot(photo: B2Photo, slot: PlacedPhoto, lead: boolean): PlacedPhoto {
  const aspect = slot.w / Math.max(1, slot.h);
  const crop = placeCrop(photo, aspect);
  return {
    ...slot,
    storagePath: photo.storagePath,
    crop: crop.letterbox ? letterboxCrop() : crop,
    fit: crop.letterbox ? "contain" : "cover",
    lead,
  };
}

function reshapeSlotToPhoto(slot: PlacedPhoto, photo: B2Photo): PlacedPhoto {
  const aspect = photo.width / Math.max(1, photo.height);
  const slotAspect = slot.w / Math.max(1, slot.h);
  let { x, y, w, h } = slot;
  if (slotAspect > aspect + 1e-4) {
    w = h * aspect;
    x = slot.x + (slot.w - w) / 2;
  } else if (slotAspect < aspect - 1e-4) {
    h = w / aspect;
    y = slot.y + (slot.h - h) / 2;
  }
  return { ...slot, x, y, w, h };
}

function eachPerm<T>(items: readonly T[], visit: (perm: T[]) => void): void {
  const arr = items.slice();
  const n = arr.length;
  visit(arr);
  if (n < 2) return;
  const counters = new Array<number>(n).fill(0);
  let i = 1;
  while (i < n) {
    if (counters[i]! < i) {
      const j = i % 2 === 0 ? 0 : counters[i]!;
      const tmp = arr[j]!;
      arr[j] = arr[i]!;
      arr[i] = tmp;
      visit(arr);
      counters[i]! += 1;
      i = 1;
    } else {
      counters[i] = 0;
      i += 1;
    }
  }
}

function assignmentCost(
  photos: readonly PlacedPhoto[],
  heroPath: string | undefined,
  byPath: ReadonlyMap<string, B2Photo>,
): number {
  let letterboxes = 0;
  let crop = 0;
  let heroArea = 0;
  let maxFit = 0;
  for (const photo of photos) {
    const boxed = photo.crop.letterbox || photo.fit === "contain";
    if (boxed) letterboxes += 1;
    crop += photo.crop.maxSide;
    const area = photo.w * photo.h;
    const source = byPath.get(photo.storagePath);
    if (source && !boxed && slotFitsPhoto(source, photo.w, photo.h) && area > maxFit) maxFit = area;
    if (photo.storagePath === heroPath && !boxed) heroArea = area;
  }
  const heroFitsLargest = heroArea > 0 && heroArea >= maxFit - 1;
  return letterboxes * 10_000 + crop * 40 - (heroFitsLargest ? 80 : 0) - heroArea * 0.001;
}

function greedyAssign(slots: readonly PlacedPhoto[], sources: B2Photo[], hero: B2Photo): B2Photo[] {
  const remaining = sources.slice();
  const assign: Array<B2Photo | undefined> = new Array(slots.length);
  const used = new Set<number>();
  const place = (photo: B2Photo, preferLargest: boolean) => {
    let best = -1;
    let bestKey = Infinity;
    slots.forEach((slot, index) => {
      if (used.has(index)) return;
      const crop = placeCrop(photo, slot.w / Math.max(1, slot.h));
      const area = slot.w * slot.h;
      const key = crop.letterbox
        ? 1e6 + Math.abs(Math.log((slot.w / Math.max(1, slot.h)) / (photo.width / Math.max(1, photo.height))))
        : crop.maxSide * 10 - (preferLargest ? area / 1000 : 0);
      if (key < bestKey) {
        bestKey = key;
        best = index;
      }
    });
    if (best < 0) return;
    used.add(best);
    assign[best] = photo;
    const at = remaining.findIndex((item) => item.storagePath === photo.storagePath);
    if (at >= 0) remaining.splice(at, 1);
  };
  place(hero, true);
  for (const photo of remaining.slice()) place(photo, false);
  return assign.filter((photo): photo is B2Photo => !!photo);
}

/** Bind photos to existing slot geometry without letterboxing the lead when a fitting slot exists. */
export function bindPhotosToSlots(placed: PlacedPhoto[], ordered: readonly B2Photo[]): PlacedPhoto[] {
  if (placed.length === 0) return placed;
  const byPath = new Map(ordered.map((photo) => [photo.storagePath, photo]));
  const sources = placed.map((slot) => byPath.get(slot.storagePath)).filter((photo): photo is B2Photo => !!photo);
  if (sources.length !== placed.length) return placed;
  const hero =
    ordered.find((photo) => sources.some((item) => item.storagePath === photo.storagePath)) ?? sources[0]!;

  const apply = (slots: readonly PlacedPhoto[], assign: readonly B2Photo[]) =>
    slots.map((slot, index) => placeInSlot(assign[index]!, slot, assign[index]!.storagePath === hero.storagePath));

  let best = apply(placed, sources);
  let bestCost = assignmentCost(best, hero.storagePath, byPath);

  const consider = (slots: readonly PlacedPhoto[], assign: readonly B2Photo[]) => {
    if (assign.length !== slots.length) return;
    const photos = apply(slots, assign);
    const next = assignmentCost(photos, hero.storagePath, byPath);
    if (next + 1e-9 < bestCost) {
      best = photos;
      bestCost = next;
    }
  };

  if (placed.length <= 7) eachPerm(sources, (perm) => consider(placed, perm));
  else consider(placed, greedyAssign(placed, sources, hero));

  const heroPlaced = best.find((photo) => photo.storagePath === hero.storagePath);
  if (heroPlaced && (heroPlaced.crop.letterbox || heroPlaced.fit === "contain")) {
    let largest = 0;
    placed.forEach((slot, index) => {
      if (slot.w * slot.h > placed[largest]!.w * placed[largest]!.h + 0.5) largest = index;
    });
    const reshaped = placed.map((slot, index) => (index === largest ? reshapeSlotToPhoto(slot, hero) : slot));
    const rest = sources.filter((photo) => photo.storagePath !== hero.storagePath);
    const assign: B2Photo[] = reshaped.map((_, index) => (index === largest ? hero : rest.shift()!));
    if (assign.every(Boolean) && assign.length === reshaped.length) consider(reshaped, assign);
    consider(reshaped, greedyAssign(reshaped, sources, hero));
  }

  return best;
}

function markLead(photos: PlacedPhoto[], ordered: readonly B2Photo[]): PlacedPhoto[] {
  return bindPhotosToSlots(photos, ordered);
}

type Built = {
  templateId: B2TemplateId;
  pages: Array<{ lines: PlacedLine[]; photos: PlacedPhoto[] }>;
  fontSize: number;
  blankRatio: number;
  meanCrop: number;
  heroIsLargest: boolean;
  objectIsBiggest: boolean;
  hasPerson: boolean;
  affinity: number;
  letterboxCount: number;
};

function statsFor(
  photos: PlacedPhoto[],
  lines: PlacedLine[],
  ordered: readonly B2Photo[],
  fontSize: number,
  affinity: number,
  templateId: B2TemplateId,
): Omit<Built, "pages"> {
  const areas = photos.map((photo) => photo.w * photo.h);
  const maxArea = areas.length ? Math.max(...areas) : 0;
  const hero = ordered[0];
  const heroBox = hero ? photos.find((photo) => photo.storagePath === hero.storagePath) : undefined;
  const heroIsLargest = photos.length === 0 || (!!heroBox && heroBox.w * heroBox.h >= maxArea - 1);
  const biggest = photos[areas.indexOf(maxArea)];
  const biggestSource = biggest ? ordered.find((photo) => photo.storagePath === biggest.storagePath) : undefined;
  const objectIsBiggest = !!biggestSource && realFaces(biggestSource).length === 0;
  const hasPerson = ordered.some((photo) => realFaces(photo).length > 0);
  const meanCrop = photos.length ? photos.reduce((sum, photo) => sum + photo.crop.maxSide, 0) / photos.length : 0;
  const letterboxCount = photos.filter((photo) => photo.crop.letterbox || photo.fit === "contain").length;
  const blankRatio = regionUnfilledRatio(photos, lines, [], B2_BODY_TOP, B2_CONTENT_BOTTOM);
  return {
    templateId,
    fontSize,
    blankRatio: clamp(blankRatio, 0, 1),
    meanCrop,
    heroIsLargest,
    objectIsBiggest,
    hasPerson,
    affinity,
    letterboxCount,
  };
}

function clampPhotoToPage(photo: PlacedPhoto): PlacedPhoto {
  let { x, y, w, h } = photo;
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > B2_PAGE_W) w = Math.max(1, B2_PAGE_W - x);
  if (y + h > B2_CONTENT_BOTTOM) h = Math.max(1, B2_CONTENT_BOTTOM - y);
  return { ...photo, x, y, w, h };
}

function finishSingle(
  templateId: B2TemplateId,
  ordered: readonly B2Photo[],
  photos: PlacedPhoto[],
  lines: PlacedLine[],
  fontSize: number,
  affinity: number,
): Built {
  const marked = markLead(photos, ordered).map(clampPhotoToPage);
  return {
    ...statsFor(marked, lines, ordered, fontSize, affinity, templateId),
    pages: [{ lines, photos: marked }],
  };
}

function columnsFor(text: string): 1 | 2 {
  return wordCount(text) > 70 ? 2 : 1;
}

function fitPhotosThenText(input: {
  templateId: B2TemplateId;
  ordered: readonly B2Photo[];
  text: string;
  ink: string;
  affinity: number;
  fonts: number[];
  columns?: 1 | 2;
  block: (stretch: number) => Block | null;
}): Built | null {
  if (input.ordered.length === 0) return null;
  const columns = input.columns ?? columnsFor(input.text);
  const fonts = input.fonts;
  let best: Built | null = null;
  for (const size of fonts) {
    const needed = textHeight(input.text, size, B2_INNER_W, columns);
    if (needed == null) continue;
    const budget = B2_AVAIL - needed - (input.text.trim() ? B2_GAP : 0);
    if (budget < 48) continue;
    const block = fitStretch(input.block, budget);
    if (!block) continue;
    const photos = shiftBlock(block, B2_INNER_X, B2_BODY_TOP);
    const textY = B2_BODY_TOP + block.height + (input.text.trim() ? B2_GAP : 0);
    const textH = B2_CONTENT_BOTTOM - textY;
    if (input.text.trim() && textH < size * 1.2) continue;
    const flowed = input.text.trim()
      ? flowText({
          text: input.text,
          x: B2_INNER_X,
          y: textY,
          w: B2_INNER_W,
          h: textH,
          columns,
          size,
          fill: true,
          color: input.ink,
        })
      : { lines: [], used: 0 };
    if (!flowed) continue;
    const built = finishSingle(input.templateId, input.ordered, photos, flowed.lines, size, input.affinity);
    if (
      !best ||
      built.letterboxCount < best.letterboxCount ||
      (built.letterboxCount === best.letterboxCount && built.fontSize > best.fontSize)
    ) {
      best = built;
    }
    if (best.letterboxCount === 0) break;
  }
  return best;
}

function exactSlots(photos: readonly B2Photo[], widthFor: (photo: B2Photo) => number): Block | null {
  let y = 0;
  const items: PlacedPhoto[] = [];
  for (const photo of photos) {
    const aspect = photo.width / Math.max(1, photo.height);
    const width = Math.min(B2_INNER_W, Math.max(36, widthFor(photo)));
    const height = width / aspect;
    items.push({
      storagePath: photo.storagePath,
      x: (B2_INNER_W - width) / 2,
      y,
      w: width,
      h: height,
      crop: { ...ZERO_CROP },
      fit: "cover",
      lead: false,
    });
    y += height + ROW_GAP;
  }
  return { items, height: Math.max(0, y - ROW_GAP) };
}

function scaleBlockTo(block: Block, budget: number): Block {
  const maxItemW = Math.max(1, ...block.items.map((item) => item.w));
  const scale = Math.min(budget / Math.max(1, block.height), B2_INNER_W / maxItemW);
  const items = block.items.map((item) => ({
    ...item,
    x: item.x * scale,
    y: item.y * scale,
    w: item.w * scale,
    h: item.h * scale,
  }));
  const minX = Math.min(...items.map((item) => item.x));
  const maxRight = Math.max(...items.map((item) => item.x + item.w));
  const shift = (B2_INNER_W - (maxRight - minX)) / 2 - minX;
  return {
    items: items.map((item) => ({ ...item, x: item.x + shift })),
    height: block.height * scale,
  };
}

function buildPortraitFeature(hero: B2Photo, ordered: B2Photo[], text: string, ink: string): Built | null {
  const aspect = hero.width / Math.max(1, hero.height);
  const textMin = 96;
  const maxW = B2_INNER_W - textMin - 14;
  let photoH = Math.min(B2_AVAIL, maxW / Math.max(0.2, aspect));
  let photoW = photoH * aspect;
  if (photoW > maxW) {
    photoW = maxW;
    photoH = photoW / aspect;
  }
  photoW = Math.min(photoW, B2_INNER_W * 0.62);
  photoH = photoW / aspect;
  if (photoH > B2_AVAIL) {
    photoH = B2_AVAIL;
    photoW = photoH * aspect;
  }
  const textX = B2_INNER_X + photoW + 14;
  const textW = B2_INNER_X + B2_INNER_W - textX;
  if (textW < 80 || photoW < 64 || photoH < 64) return null;
  let best: Built | null = null;
  for (const size of BODY_FONTS) {
    const beside = text.trim()
      ? flowText({
          text,
          x: textX,
          y: B2_BODY_TOP,
          w: textW,
          h: B2_AVAIL,
          columns: 1,
          size,
          fill: true,
          color: ink,
        })
      : { lines: [] as PlacedLine[], used: 0 };
    if (!beside) continue;
    if (beside.used > B2_AVAIL + 0.5) continue;
    const photos: PlacedPhoto[] = [
      {
        storagePath: hero.storagePath,
        x: B2_INNER_X,
        y: B2_BODY_TOP,
        w: photoW,
        h: photoH,
        crop: { ...ZERO_CROP },
        fit: "cover",
        lead: true,
      },
    ];
    const built = finishSingle("portrait-feature", ordered, photos, beside.lines, size, 1.45);
    if (!best || built.blankRatio < best.blankRatio - 1e-9 || (Math.abs(built.blankRatio - best.blankRatio) < 1e-9 && built.fontSize > best.fontSize)) {
      best = built;
    }
  }
  return best;
}

function buildLetterbox(ordered: B2Photo[], text: string, ink: string): Built | null {
  if (!ordered.some(isExtreme)) return null;
  const natural = exactSlots(ordered, (photo) => {
    const aspect = photo.width / Math.max(1, photo.height);
    if (aspect < 0.5) return B2_INNER_W * 0.46;
    return B2_INNER_W;
  });
  if (!natural) return null;
  for (const size of BODY_FONTS) {
    const needed = textHeight(text, size, B2_INNER_W, columnsFor(text)) ?? 0;
    const budget = B2_AVAIL - needed - (text.trim() ? B2_GAP : 0);
    if (budget < 36) continue;
    const fitted = scaleBlockTo(natural, budget);
    if (fitted.height > budget + 1) continue;
    const photos = shiftBlock(fitted, B2_INNER_X, B2_BODY_TOP);
    const textY = B2_BODY_TOP + fitted.height + (text.trim() ? B2_GAP : 0);
    const flowed = text.trim()
      ? flowText({
          text,
          x: B2_INNER_X,
          y: textY,
          w: B2_INNER_W,
          h: B2_CONTENT_BOTTOM - textY,
          columns: columnsFor(text),
          size,
          fill: true,
          color: ink,
        })
      : { lines: [], used: 0 };
    if (!flowed) continue;
    return finishSingle("letterbox", ordered, photos, flowed.lines, size, 3.2);
  }
  return null;
}

function buildSideStack(ordered: B2Photo[], text: string, ink: string): Built | null {
  if (ordered.length < 2 || ordered.length > 4 || ordered.some(isExtreme)) return null;
  const textMin = wordCount(text) < 80 ? 132 : 200;
  const columnW = Math.min(B2_INNER_W * 0.62, B2_INNER_W - textMin - 12);
  const textW = B2_INNER_W - columnW - 12;
  if (columnW < 90 || textW < 80) return null;
  let heights = ordered.map((photo) => columnW / (photo.width / Math.max(1, photo.height)));
  let stack = heights.reduce((sum, height) => sum + height, 0) + ROW_GAP * (ordered.length - 1);
  const target = B2_AVAIL * 0.98;
  if (Math.abs(stack - target) > 8) {
    const scale = target / stack;
    const next = ordered.map((photo, index) => {
      const height = heights[index]! * scale;
      return placeCrop(photo, columnW / height);
    });
    if (!next.some((crop) => crop.letterbox || crop.maxSide > MAX_TRIM + 0.002)) {
      heights = heights.map((height) => height * scale);
      stack = heights.reduce((sum, height) => sum + height, 0) + ROW_GAP * (ordered.length - 1);
    } else if (stack > target) {
      return null;
    }
  }
  let best: Built | null = null;
  for (const size of BODY_FONTS) {
    const flowed = flowText({
      text,
      x: B2_INNER_X,
      y: B2_BODY_TOP,
      w: textW,
      h: Math.min(B2_AVAIL, Math.max(stack, size * 2)),
      columns: 1,
      size,
      fill: true,
      color: ink,
    });
    if (!flowed) continue;
    if (flowed.used > B2_AVAIL + 0.5) continue;
    let y = B2_BODY_TOP;
    const photos: PlacedPhoto[] = ordered.map((photo, index) => {
      const height = heights[index]!;
      const crop = placeCrop(photo, columnW / height);
      const placed: PlacedPhoto = {
        storagePath: photo.storagePath,
        x: B2_INNER_X + textW + 12,
        y,
        w: columnW,
        h: height,
        crop: crop.letterbox ? letterboxCrop() : crop,
        fit: crop.letterbox ? "contain" : "cover",
        lead: false,
      };
      y += height + ROW_GAP;
      return placed;
    });
    const built = finishSingle("side-stack", ordered, photos, flowed.lines, size, 0.55);
    if (!best || built.blankRatio < best.blankRatio - 1e-9) best = built;
  }
  return best;
}

function buildMosaic(ordered: B2Photo[], text: string, ink: string): Built | null {
  if (ordered.length < 3 || ordered.length > 6) return null;
  const hero = ordered[0]!;
  if (hero.width / hero.height >= 0.95 || isExtreme(hero)) return null;
  const right = ordered.slice(1, 5);
  const below = ordered.slice(1 + right.length);
  if (below.length === 1) return null;
  const heroAspect = aspectAt(hero, 0.15);
  let heroW = B2_INNER_W * 0.58;
  let heroH = heroW / heroAspect;
  const maxH = B2_AVAIL * 0.92;
  if (heroH > maxH) {
    heroH = maxH;
    heroW = heroH * heroAspect;
  }
  const rightW = B2_INNER_W - heroW - ROW_GAP;
  if (rightW < 70) return null;
  const photos: PlacedPhoto[] = [
    {
      storagePath: hero.storagePath,
      x: 0,
      y: 0,
      w: heroW,
      h: heroH,
      crop: placeCrop(hero, heroW / Math.max(1, heroH)),
      fit: "cover",
      lead: true,
    },
  ];
  if (photos[0]!.crop.letterbox) return null;
  const rightStack = fitStretch((stretch) => {
    let y = 0;
    const items: PlacedPhoto[] = [];
    for (const photo of right) {
      const aspect = aspectAt(photo, stretch);
      const height = rightW / aspect;
      if (!(height > 24)) return null;
      const crop = placeCrop(photo, aspect);
      if (crop.letterbox || crop.maxSide > MAX_TRIM + 0.002) return null;
      items.push({
        storagePath: photo.storagePath,
        x: heroW + ROW_GAP,
        y,
        w: rightW,
        h: height,
        crop,
        fit: "cover",
        lead: false,
      });
      y += height + ROW_GAP;
    }
    return { items, height: Math.max(0, y - ROW_GAP) };
  }, heroH);
  if (!rightStack) return null;
  photos.push(...rightStack.items);
  let blockH = heroH;
  if (below.length > 0) {
    const row = fitStretch((stretch) => rowBlock(below, [below.length], B2_INNER_W, stretch), 150);
    if (!row) return null;
    for (const item of row.items) {
      photos.push({ ...item, y: item.y + blockH + ROW_GAP });
    }
    blockH += ROW_GAP + row.height;
  }
  return fitPhotosThenText({
    templateId: "tall-mosaic",
    ordered,
    text,
    ink,
    affinity: 1.1,
    fonts: BODY_FONTS,
    block: () => ({ items: photos, height: blockH }),
  });
}

function buildFeatureBand(ordered: B2Photo[], text: string, ink: string): Built | null {
  const hero = ordered[0];
  if (!hero || ordered.length > 4 || isExtreme(hero)) return null;
  const aspect = hero.width / hero.height;
  if (aspect < 1.25 || aspect > 2.35) return null;
  const bleedW = B2_PAGE_W;
  return fitPhotosThenText({
    templateId: "feature-band",
    ordered,
    text,
    ink,
    affinity: 0.85,
    fonts: BODY_FONTS,
    block: (stretch) => {
      const heroAspect = aspectAt(hero, stretch);
      const heroH = bleedW / heroAspect;
      const rest = ordered.slice(1);
      const heroItem: PlacedPhoto = {
        storagePath: hero.storagePath,
        x: -B2_INNER_X,
        y: 0,
        w: bleedW,
        h: heroH,
        crop: placeCrop(hero, heroAspect),
        fit: "cover",
        lead: true,
      };
      if (heroItem.crop.letterbox) return null;
      if (rest.length === 0) return { items: [heroItem], height: heroH };
      const row = rowBlock(rest, magazineRowCounts(rest.length), B2_INNER_W, stretch);
      if (!row) return null;
      return {
        items: [heroItem, ...row.items.map((item) => ({ ...item, y: item.y + heroH + ROW_GAP }))],
        height: heroH + ROW_GAP + row.height,
      };
    },
  });
}

function buildOneLine(ordered: B2Photo[], text: string, ink: string): Built | null {
  if (!isOneLine(text)) return null;
  // Extreme aspects belong to letterbox, which is allowed to centre them.
  if (ordered.some(isExtreme)) return null;
  const trimmed = text.trim();
  if (ordered.length === 0) {
    for (const size of ONE_LINE_FONTS) {
      const width = measureTextWidth(trimmed, size, "serif");
      if (width > B2_INNER_W) continue;
      const bandH = size * 1.25;
      const y = B2_BODY_TOP + Math.max(0, (B2_AVAIL - bandH) / 2);
      const line: PlacedLine = {
        text: trimmed,
        x: B2_INNER_X + (B2_INNER_W - width) / 2,
        y,
        w: width,
        h: bandH,
        size,
        font: "serif",
        color: ink,
        role: "body",
      };
      return finishSingle("one-line", ordered, [], [line], size, 8);
    }
    return null;
  }
  for (const size of ONE_LINE_FONTS) {
    const width = measureTextWidth(trimmed, size, "serif");
    if (width > B2_INNER_W) continue;
    const textH = size * 1.25;
    const photoBudget = B2_AVAIL - textH - B2_GAP;
    // Full content width. Scaling a tall photo down to centre it leaves empty sides.
    const fitted = fitStretch(
      (stretch) => rowBlock(ordered, magazineRowCounts(ordered.length), B2_INNER_W, stretch),
      photoBudget,
    );
    if (!fitted) continue;
    const photos = shiftBlock(fitted, B2_INNER_X, B2_BODY_TOP);
    const textY = B2_BODY_TOP + fitted.height + B2_GAP;
    if (textY + textH > B2_CONTENT_BOTTOM + 0.5) continue;
    const line: PlacedLine = {
      text: trimmed,
      x: B2_INNER_X + (B2_INNER_W - width) / 2,
      y: textY,
      w: width,
      h: textH,
      size,
      font: "serif",
      color: ink,
      role: "body",
    };
    return finishSingle("one-line", ordered, photos, [line], size, 6);
  }
  return null;
}

function buildTextPage(
  text: string,
  ink: string,
  top = B2_BODY_TOP,
  height = B2_AVAIL,
  box: { x: number; w: number } = { x: B2_INNER_X, w: B2_INNER_W },
  fonts: readonly number[] = wordCount(text) < 80 ? DISPLAY_FONTS : BODY_FONTS,
  columns: 1 | 2 = columnsFor(text),
): { lines: PlacedLine[]; fontSize: number } | null {
  const columnCount: 1 | 2 = box.w < 240 ? 1 : columns;
  for (const size of fonts) {
    const flowed = flowText({
      text,
      x: box.x,
      y: top,
      w: box.w,
      h: height,
      columns: columnCount,
      size,
      fill: true,
      color: ink,
    });
    if (flowed && joinTokens(tokenize(text)).length > 0 && flowed.lines.length > 0) {
      return { lines: flowed.lines, fontSize: size };
    }
    if (!text.trim()) return { lines: [], fontSize: size };
  }
  return null;
}

function buildTextOnly(text: string, ink: string): Built | null {
  if (isOneLine(text) || wordCount(text) >= SPREAD_WORD_MIN) return null;
  const page = buildTextPage(text, ink);
  if (!page) return null;
  return finishSingle("text-only", [], [], page.lines, page.fontSize, 1.4);
}

function fitTokenCount(
  tokens: readonly Token[],
  height: number,
  limit: number,
  width: number,
  columns: 1 | 2,
): number {
  let lo = 0;
  let hi = Math.min(limit, tokens.length);
  let best = 0;
  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (mid === 0) {
      lo = 1;
      continue;
    }
    const chunk = joinTokens(tokens.slice(0, mid));
    const needed = textHeight(chunk, B2_BODY_SIZE, width, width < 240 ? 1 : columns);
    if (needed != null && needed <= height + 0.5) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Flush-left stack at the real aspect. Used when a full-width row cannot be reached inside the trim limit. */
function flushColumn(photos: readonly B2Photo[], maxH: number): Block | null {
  if (photos.length === 0) return null;
  const aspects = photos.map((photo) => photo.width / Math.max(1, photo.height));
  const gaps = ROW_GAP * Math.max(0, photos.length - 1);
  const sumInv = aspects.reduce((sum, aspect) => sum + 1 / Math.max(0.05, aspect), 0);
  let width = Math.min(B2_INNER_W * 0.62, Math.max(120, (maxH - gaps) / sumInv));
  const itemsAt = (columnW: number): PlacedPhoto[] => {
    let y = 0;
    return photos.map((photo) => {
      const aspect = photo.width / Math.max(1, photo.height);
      const height = columnW / aspect;
      const placed: PlacedPhoto = {
        storagePath: photo.storagePath,
        x: 0,
        y,
        w: columnW,
        h: height,
        crop: { ...ZERO_CROP },
        fit: "cover",
        lead: false,
      };
      y += height + ROW_GAP;
      return placed;
    });
  };
  let items = itemsAt(width);
  let height = Math.max(0, items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0));
  if (height > maxH + 0.6) {
    const scale = maxH / height;
    width *= scale;
    items = itemsAt(width);
    height = Math.max(0, items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0));
  }
  if (!(height > 1) || width < 80) return null;
  return { items, height };
}

/**
 * Photos on a spread span the content width at the real aspect when that fits.
 * A portrait that would be taller than the page is trimmed within 10% so the
 * block still spans the width. Text shares the page only when a readable
 * region remains; otherwise the letter continues on the next page.
 */
function spreadOpening(ordered: readonly B2Photo[]): {
  photos: PlacedPhoto[];
  text: { x: number; y: number; w: number; h: number } | null;
} {
  const top = B2_BODY_TOP;
  if (ordered.length === 0) {
    return { photos: [], text: { x: B2_INNER_X, y: top, w: B2_INNER_W, h: B2_AVAIL } };
  }
  const counts = magazineRowCounts(ordered.length);
  const width = B2_INNER_W;
  let block = ordered.some(isExtreme) ? null : rowBlock(ordered, counts, width, NATIVE_STRETCH);
  if (block && block.height > B2_AVAIL) {
    block = fitStretch((stretch) => rowBlock(ordered, counts, width, stretch), B2_AVAIL);
  }
  if (!block) block = flushColumn(ordered, B2_AVAIL);
  if (!block) {
    return { photos: [], text: { x: B2_INNER_X, y: top, w: B2_INNER_W, h: B2_AVAIL } };
  }
  const share = block.height <= B2_AVAIL * 0.62 && block.height + B2_GAP + B2_BODY_SIZE * 4 <= B2_AVAIL;
  if (!share) {
    const grown = ordered.some(isExtreme)
      ? null
      : fitStretch((stretch) => rowBlock(ordered, counts, width, stretch), B2_AVAIL);
    if (grown && grown.height >= block.height - 0.5) block = grown;
  }
  const photos = shiftBlock(block, B2_INNER_X, top);
  if (share) {
    const textY = top + block.height + B2_GAP;
    return {
      photos,
      text: { x: B2_INNER_X, y: textY, w: B2_INNER_W, h: Math.max(0, B2_CONTENT_BOTTOM - textY) },
    };
  }
  const right = Math.max(...photos.map((photo) => photo.x + photo.w));
  const left = Math.min(...photos.map((photo) => photo.x));
  const beside = B2_INNER_X + B2_INNER_W - right - B2_GAP;
  if (left - B2_INNER_X <= B2_INNER_W * PHOTO_SIDE_GAP_MAX && beside >= 150) {
    return { photos, text: { x: right + B2_GAP, y: top, w: beside, h: B2_AVAIL } };
  }
  return { photos, text: null };
}

function pageBlank(photos: readonly PlacedPhoto[], lines: readonly PlacedLine[], bands: readonly PageBand[] = []): number {
  return regionUnfilledRatio(photos, lines, bands, B2_BODY_TOP, B2_CONTENT_BOTTOM);
}

function buildSpread(ordered: B2Photo[], text: string, ink: string, force: boolean): Built | null {
  const tokens = tokenize(text);
  if (!force && tokens.length < SPREAD_WORD_MIN) return null;
  if (tokens.length === 0 && ordered.length === 0) return null;

  const opening = spreadOpening(ordered);
  const pages: Built["pages"] = [];
  if (opening.photos.length > 0 && !opening.text) {
    pages.push({ lines: [], photos: opening.photos });
  }
  let cursor = 0;
  const minPages = tokens.length >= SPREAD_WORD_MIN ? 2 : 1;
  let guard = 0;
  while ((cursor < tokens.length || pages.length < minPages) && guard < 16) {
    guard += 1;
    if (cursor >= tokens.length) break;
    const region =
      pages.length === 0 && opening.text
        ? opening.text
        : { x: B2_INNER_X, y: B2_BODY_TOP, w: B2_INNER_W, h: B2_AVAIL };
    const columns: 1 | 2 = region.w < 240 ? 1 : columnsFor(joinTokens(tokens.slice(cursor)));
    const remaining = tokens.slice(cursor);
    let limit = remaining.length;
    if (minPages >= 2 && pages.length === 0 && remaining.length > 1) {
      limit = Math.max(1, Math.min(limit, Math.ceil(tokens.length / 2)));
    }
    let take = fitTokenCount(remaining, region.h, limit, region.w, columns);
    if (take < 1) take = 1;
    let flowed = buildTextPage(joinTokens(remaining.slice(0, take)), ink, region.y, region.h, region, [B2_BODY_SIZE], columns);
    while (!flowed && take > 1) {
      take -= 1;
      flowed = buildTextPage(joinTokens(remaining.slice(0, take)), ink, region.y, region.h, region, [B2_BODY_SIZE], columns);
    }
    if (!flowed) return null;
    const photos = pages.length === 0 ? opening.photos : [];
    pages.push({ lines: flowed.lines, photos });
    cursor += take;
  }
  if (tokens.length > 0 && cursor < tokens.length) return null;
  if (pages.length < minPages) return null;
  if (pages.length === 0) return null;
  const markedPages = pages.map((page) => ({
    ...page,
    photos: markLead(page.photos, ordered).map(clampPhotoToPage),
  }));
  const fontSize = Math.min(
    B2_BODY_SIZE,
    ...markedPages.flatMap((page) => page.lines.map((line) => line.size)),
  );
  const blanks = markedPages.map((page) => pageBlank(page.photos, page.lines));
  const blankRatio = blanks.reduce((sum, value) => sum + value, 0) / blanks.length;
  const allPhotos = markedPages.flatMap((page) => page.photos);
  const allLines = markedPages.flatMap((page) => page.lines);
  return {
    ...statsFor(allPhotos, allLines, ordered, fontSize || B2_BODY_SIZE, force ? 0.35 : 1.6, "spread"),
    blankRatio: clamp(blankRatio, 0, 1),
    pages: markedPages,
  };
}

function candidateList(ordered: B2Photo[], text: string, ink: string): Built[] {
  const built: Array<Built | null> = [];
  const hero = ordered[0];
  const aspect = hero ? hero.width / Math.max(1, hero.height) : 1;
  const extreme = ordered.some(isExtreme);
  built.push(buildOneLine(ordered, text, ink));
  if (ordered.length === 0) built.push(buildTextOnly(text, ink));
  if (hero && ordered.length === 1 && !isOneLine(text) && wordCount(text) < 45 && !extreme) {
    built.push(
      fitPhotosThenText({
        templateId: "announce",
        ordered,
        text,
        ink,
        affinity: 1.7,
        fonts: [22, 20, 18, 16, B2_BODY_SIZE],
        columns: 1,
        block: (stretch) => rowBlock(ordered, [1], B2_INNER_W, stretch),
      }),
    );
  }
  if (hero && ordered.length === 1 && aspect < 1.05 && !extreme && !isOneLine(text)) {
    built.push(buildPortraitFeature(hero, ordered, text, ink));
  }
  if (hero && ordered.length === 1 && aspect >= 0.95 && !extreme) {
    built.push(
      fitPhotosThenText({
        templateId: "landscape-hero",
        ordered,
        text,
        ink,
        affinity: 1.25,
        fonts: wordCount(text) < 80 ? DISPLAY_FONTS : BODY_FONTS,
        block: (stretch) => rowBlock(ordered, [1], B2_INNER_W, stretch),
      }),
    );
  }
  built.push(buildLetterbox(ordered, text, ink));
  if (ordered.length === 2 && !extreme) {
    built.push(
      fitPhotosThenText({
        templateId: "duo",
        ordered,
        text,
        ink,
        affinity: 0.55,
        fonts: BODY_FONTS,
        block: (stretch) => rowBlock(ordered, [2], B2_INNER_W, stretch),
      }),
    );
  }
  built.push(buildSideStack(ordered, text, ink));
  if (hero && ordered.length >= 2 && ordered.length <= 5 && aspect >= 1.1 && !extreme) {
    built.push(
      fitPhotosThenText({
        templateId: "hero-strip",
        ordered,
        text,
        ink,
        affinity: 1.05,
        fonts: BODY_FONTS,
        block: (stretch) => {
          const heroAspect = aspectAt(hero, stretch);
          const heroH = B2_INNER_W / heroAspect;
          const crop = placeCrop(hero, heroAspect);
          if (crop.letterbox) return null;
          const rest = rowBlock(ordered.slice(1), magazineRowCounts(ordered.length - 1), B2_INNER_W, stretch);
          if (!rest) return null;
          return {
            items: [
              {
                storagePath: hero.storagePath,
                x: 0,
                y: 0,
                w: B2_INNER_W,
                h: heroH,
                crop,
                fit: "cover",
                lead: true,
              },
              ...rest.items.map((item) => ({ ...item, y: item.y + heroH + ROW_GAP })),
            ],
            height: heroH + ROW_GAP + rest.height,
          };
        },
      }),
    );
  }
  built.push(buildFeatureBand(ordered, text, ink));
  built.push(buildMosaic(ordered, text, ink));
  if (ordered.length >= 3 && ordered.length <= 6 && !extreme) {
    built.push(
      fitPhotosThenText({
        templateId: "grid-rows",
        ordered,
        text,
        ink,
        affinity: 0.7,
        fonts: BODY_FONTS,
        block: (stretch) => rowBlock(ordered, magazineRowCounts(ordered.length), B2_INNER_W, stretch),
      }),
    );
  }
  if (ordered.length >= 6) {
    built.push(
      fitPhotosThenText({
        templateId: "gallery",
        ordered,
        text,
        ink,
        affinity: ordered.length >= 7 ? 2.4 : 0.4,
        fonts: BODY_FONTS,
        block: (stretch) => rowBlock(ordered, magazineRowCounts(ordered.length), B2_INNER_W, stretch),
      }),
    );
  }
  if (tokenize(text).length >= SPREAD_WORD_MIN || ordered.length === 0) {
    built.push(buildSpread(ordered, text, ink, false));
  }
  return built.filter((item): item is Built => item !== null);
}

function pickBuilt(ordered: B2Photo[], text: string, ink: string, previousTemplateId: string | null): Built {
  const candidates = candidateList(ordered, text, ink);
  let best: { built: Built; score: number } | null = null;
  for (const built of candidates) {
    const score = scoreCandidate({
      blankRatio: built.blankRatio,
      fontSize: built.fontSize,
      meanCrop: built.meanCrop,
      heroIsLargest: built.heroIsLargest,
      objectIsBiggest: built.objectIsBiggest,
      hasPerson: built.hasPerson,
      templateId: built.templateId,
      previousTemplateId,
      affinity: built.affinity,
      letterboxCount: built.letterboxCount,
    });
    if (!best || score > best.score + 1e-9) best = { built, score };
  }
  if (best) return best.built;
  const forced = buildSpread(ordered, text, ink, true);
  if (forced && forced.pages.some((page) => page.lines.length > 0 || page.photos.length > 0 || !text.trim())) {
    return forced;
  }
  return {
    templateId: "text-only",
    pages: [{ lines: [], photos: [] }],
    fontSize: 12,
    blankRatio: 1,
    meanCrop: 0,
    heroIsLargest: true,
    objectIsBiggest: false,
    hasPerson: false,
    affinity: 0,
    letterboxCount: 0,
  };
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function headerColors(style: HeaderStyle, ink: string, accent: string, paper: string): { fill: string; text: string } {
  if (style === "block") {
    const fill = luminance(accent) < 170 ? accent : ink;
    return { fill, text: luminance(paper) > 180 ? paper : "#fffdf8" };
  }
  return { fill: "transparent", text: ink };
}

function placeName(name: string, style: HeaderStyle, color: string): PlacedLine {
  const font: FontStyle = style === "serif" ? "serifItalic" : "serifBold";
  let size = style === "serif" ? 26 : 22;
  const maxWidth = B2_INNER_W - (style === "block" ? 20 : 0);
  while (size > 13 && measureTextWidth(name, size, font) > maxWidth) size -= 0.5;
  const width = measureTextWidth(name, size, font);
  const x = style === "block" ? B2_INNER_X + 10 : B2_INNER_X + Math.max(0, (B2_INNER_W - width) / 2);
  return {
    text: name,
    x,
    y: B2_CONTENT_TOP + Math.max(4, (B2_HEADER_H - size) / 2),
    w: Math.min(maxWidth, width),
    h: size * 1.15,
    size,
    font,
    color,
    role: "name",
  };
}

function placeFooter(pageNumber: number, groupName: string, month: string, ink: string): PlacedLine[] {
  const y = B2_PAGE_H - B2_FOOTER_H + 8;
  const left = `${groupName} · ${month}`;
  const right = String(pageNumber);
  return [
    {
      text: left,
      x: B2_MARGIN_X,
      y,
      w: B2_INNER_W * 0.78,
      h: 12,
      size: 9,
      font: "sans",
      color: ink,
      role: "footer",
    },
    {
      text: right,
      x: B2_PAGE_W - B2_MARGIN_X - 28,
      y,
      w: 28,
      h: 12,
      size: 9,
      font: "sans",
      color: ink,
      role: "footer",
    },
  ];
}

function coverTrimCap(photo: B2Photo): number {
  return realFaces(photo).length === 0 ? COVER_UNKNOWN_TRIM : MAX_TRIM;
}

function coverRange(photo: B2Photo): [number, number] {
  const aspect = photo.width / Math.max(1, photo.height);
  if (realFaces(photo).length === 0) {
    const keep = 1 - COVER_UNKNOWN_TRIM * 2;
    return [aspect * keep, aspect / keep];
  }
  return aspectRange(photo);
}

/** t = -1 is the tallest legal cell, t = 0 is the real aspect, t = 1 is the shortest. */
function coverAspect(photo: B2Photo, t: number): number {
  const [minAspect, maxAspect] = coverRange(photo);
  const native = clamp(photo.width / Math.max(1, photo.height), minAspect, maxAspect);
  if (t >= 0) return native + (maxAspect - native) * Math.min(1, t);
  return native + (minAspect - native) * Math.min(1, -t);
}

type Pack = { items: PlacedPhoto[]; width: number; height: number };

const compositionCache = new Map<number, number[][]>();

function compositions(count: number): number[][] {
  const cached = compositionCache.get(count);
  if (cached) return cached;
  const out: number[][] = [];
  const walk = (remain: number, acc: number[]) => {
    if (remain === 0) {
      out.push(acc.slice());
      return;
    }
    for (let size = 1; size <= remain; size += 1) {
      acc.push(size);
      walk(remain - size, acc);
      acc.pop();
    }
  };
  if (count > 0) walk(count, []);
  compositionCache.set(count, out);
  return out;
}

function coverOrders(photos: readonly B2Photo[]): B2Photo[][] {
  const aspect = (photo: B2Photo) => photo.width / Math.max(1, photo.height);
  const given = photos.slice();
  const asc = photos.slice().sort((a, b) => aspect(a) - aspect(b) || a.storagePath.localeCompare(b.storagePath));
  const desc = asc.slice().reverse();
  const alt: B2Photo[] = [];
  const used = new Set<string>();
  for (let i = 0; i < photos.length; i += 1) {
    const source = i % 2 === 0 ? asc : desc;
    const next = source.find((photo) => !used.has(photo.storagePath));
    if (!next) break;
    used.add(next.storagePath);
    alt.push(next);
  }
  const seen = new Set<string>();
  const orders: B2Photo[][] = [];
  for (const order of [given, asc, desc, alt]) {
    const key = order.map((photo) => photo.storagePath).join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    orders.push(order);
  }
  return orders;
}

function layoutRows(photos: readonly B2Photo[], counts: number[], t: number, width: number): Pack | null {
  let y = 0;
  let index = 0;
  const items: PlacedPhoto[] = [];
  let maxRight = 0;
  for (let row = 0; row < counts.length; row += 1) {
    const count = counts[row]!;
    const slice = photos.slice(index, index + count);
    if (slice.length !== count) return null;
    const aspects = slice.map((photo) => coverAspect(photo, t));
    const gaps = ROW_GAP * (slice.length - 1);
    const sum = aspects.reduce((total, aspect) => total + aspect, 0);
    const height = (width - gaps) / sum;
    if (!(height > 1) || !Number.isFinite(height)) return null;
    let x = 0;
    for (let i = 0; i < slice.length; i += 1) {
      const photo = slice[i]!;
      const aspect = aspects[i]!;
      const boxW = aspect * height;
      const crop = placeCrop(photo, aspect);
      if (crop.letterbox || crop.maxSide > coverTrimCap(photo) + 0.002) return null;
      items.push({
        storagePath: photo.storagePath,
        x,
        y,
        w: boxW,
        h: height,
        crop,
        fit: "cover",
        lead: false,
      });
      x += boxW + (i === slice.length - 1 ? 0 : ROW_GAP);
    }
    maxRight = Math.max(maxRight, x);
    y += height + (row === counts.length - 1 ? 0 : ROW_GAP);
    index += count;
  }
  if (index !== photos.length || items.length === 0) return null;
  return { items, width: maxRight, height: y };
}

function layoutColumns(photos: readonly B2Photo[], counts: number[], t: number, height: number): Pack | null {
  let x = 0;
  let index = 0;
  const items: PlacedPhoto[] = [];
  let usedH = 0;
  for (let column = 0; column < counts.length; column += 1) {
    const count = counts[column]!;
    const slice = photos.slice(index, index + count);
    if (slice.length !== count) return null;
    const aspects = slice.map((photo) => coverAspect(photo, t));
    const gaps = ROW_GAP * (slice.length - 1);
    const sumInv = aspects.reduce((total, aspect) => total + 1 / aspect, 0);
    const colW = (height - gaps) / sumInv;
    if (!(colW > 1) || !Number.isFinite(colW)) return null;
    let y = 0;
    for (let i = 0; i < slice.length; i += 1) {
      const photo = slice[i]!;
      const aspect = aspects[i]!;
      const h = colW / aspect;
      const crop = placeCrop(photo, aspect);
      if (crop.letterbox || crop.maxSide > coverTrimCap(photo) + 0.002) return null;
      items.push({
        storagePath: photo.storagePath,
        x,
        y,
        w: colW,
        h,
        crop,
        fit: "cover",
        lead: false,
      });
      y += h + (i === slice.length - 1 ? 0 : ROW_GAP);
    }
    usedH = Math.max(usedH, y);
    x += colW + (column === counts.length - 1 ? 0 : ROW_GAP);
    index += count;
  }
  if (index !== photos.length || items.length === 0) return null;
  return { items, width: x, height: usedH };
}

function scalePack(pack: Pack, scale: number): Pack {
  return {
    width: pack.width * scale,
    height: pack.height * scale,
    items: pack.items.map((item) => ({
      ...item,
      x: item.x * scale,
      y: item.y * scale,
      w: item.w * scale,
      h: item.h * scale,
    })),
  };
}

function packArea(pack: Pack): number {
  return pack.items.reduce((sum, item) => sum + item.w * item.h, 0);
}

function packMeanCrop(pack: Pack): number {
  return pack.items.reduce((sum, item) => sum + item.crop.maxSide, 0) / pack.items.length;
}

/** Prefer a full collage. Spend trim only when it buys a filled edge. */
function packScore(pack: Pack, maxW: number, maxH: number): number {
  const area = packArea(pack);
  const crop = packMeanCrop(pack);
  const fillsH = pack.height >= maxH - 8;
  const fillsW = pack.width >= maxW - 8;
  const cropCost = fillsH && fillsW ? crop * 0.15 : crop * 2.4;
  return area * (1 - cropCost);
}

function choosePack(candidates: Array<Pack | null>, maxW: number, maxH: number): Pack | null {
  let best: Pack | null = null;
  let bestScore = -Infinity;
  for (const pack of candidates) {
    if (!pack) continue;
    if (pack.width > maxW + 0.8 || pack.height > maxH + 0.8) continue;
    const score = packScore(pack, maxW, maxH);
    if (score > bestScore + 1e-6) {
      best = pack;
      bestScore = score;
    }
  }
  return best;
}

function fitRows(photos: readonly B2Photo[], counts: number[], maxW: number, maxH: number): Pack | null {
  const direct: Array<Pack | null> = [];
  for (let step = 0; step <= 8; step += 1) direct.push(layoutRows(photos, counts, -1 + step / 4, maxW));
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) / 2;
    const pack = layoutRows(photos, counts, mid, maxW);
    if (pack && pack.height <= maxH + 0.6) {
      hi = mid;
      direct.push(pack);
    } else lo = mid;
  }
  const best = choosePack(direct, maxW, maxH);
  if (best) return best;
  const seed = layoutRows(photos, counts, 0, maxW) ?? layoutRows(photos, counts, 1, maxW);
  if (!seed || !(seed.height > 1)) return null;
  const scale = Math.min(1, maxW / seed.width, maxH / seed.height);
  if (!(scale > 0.05)) return null;
  return scalePack(seed, scale);
}

function fitColumns(photos: readonly B2Photo[], counts: number[], maxW: number, maxH: number): Pack | null {
  const direct: Array<Pack | null> = [];
  for (let step = 0; step <= 8; step += 1) direct.push(layoutColumns(photos, counts, -1 + step / 4, maxH));
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) / 2;
    const pack = layoutColumns(photos, counts, mid, maxH);
    if (pack && pack.width <= maxW + 0.6) {
      lo = mid;
      direct.push(pack);
    } else hi = mid;
  }
  const best = choosePack(direct, maxW, maxH);
  if (best) return best;
  const seed = layoutColumns(photos, counts, 0, maxH) ?? layoutColumns(photos, counts, -1, maxH);
  if (!seed || !(seed.width > 1)) return null;
  const scale = Math.min(1, maxW / seed.width, maxH / seed.height);
  if (!(scale > 0.05)) return null;
  return scalePack(seed, scale);
}

/**
 * Largest face-safe collage that fits the box. Cells with no stored face stay
 * within COVER_UNKNOWN_TRIM of the real aspect. Known faces use the 10% rule.
 */
function bestPack(photos: readonly B2Photo[], maxW: number, maxH: number): Pack | null {
  if (photos.length === 0 || maxW < 48 || maxH < 48) return null;
  let best: Pack | null = null;
  let bestScore = -Infinity;
  for (const order of coverOrders(photos)) {
    for (const counts of compositions(order.length)) {
      const packs = [fitRows(order, counts, maxW, maxH), fitColumns(order, counts, maxW, maxH)];
      for (const pack of packs) {
        if (!pack) continue;
        const score = packScore(pack, maxW, maxH);
        if (score > bestScore + 1e-6) {
          best = pack;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

type CoverTocInput = {
  missed: string;
  empty: boolean;
  toc: ReadonlyArray<{ name: string; page: number }>;
};

function tocBlockHeight(lines: readonly PlacedLine[]): number {
  if (lines.length === 0) return 0;
  return Math.max(...lines.map((line) => line.y + line.h));
}

/** Contents lines in local coordinates. `fillH` grows type a little so a colour band is not a void. */
function coverTocBlock(input: CoverTocInput, boxW: number, mode: "list" | "mast" | "fill", fillH: number): PlacedLine[] {
  const columns = mode === "mast" && input.toc.length >= 4 ? 2 : 1;
  let size = mode === "list" ? 16 : mode === "mast" ? 13 : 14;
  let gap = mode === "list" ? 10 : mode === "mast" ? 5 : 8;
  const build = (fontSize: number, rowGap: number): PlacedLine[] => {
    const lineH = fontSize + 6;
    const lines: PlacedLine[] = [];
    let y = 0;
    const push = (text: string, font: FontStyle, x: number, w: number, nextSize = fontSize) => {
      lines.push({
        text,
        x,
        y,
        w,
        h: lineH,
        size: nextSize,
        font,
        color: "#000",
        role: "cover",
      });
    };
    if (input.toc.length > 0) {
      let headSize = fontSize;
      while (headSize > 9 && measureTextWidth(IN_THIS_ISSUE, headSize, "serifItalic") > boxW) headSize -= 0.5;
      push(IN_THIS_ISSUE, "serifItalic", 0, boxW, headSize);
      y += lineH + rowGap;
      const nameRows = Math.ceil(input.toc.length / columns);
      const colW = columns === 1 ? boxW : (boxW - 18) / 2;
      for (let row = 0; row < nameRows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          const entry = input.toc[row * columns + col];
          if (!entry) continue;
          const page = String(entry.page);
          const pageW = Math.max(10, measureTextWidth(page, fontSize, "sans"));
          let nameSize = fontSize;
          const room = Math.max(12, colW - pageW - 8);
          while (nameSize > 8 && measureTextWidth(entry.name, nameSize, "serif") > room) nameSize -= 0.5;
          const x = col * (colW + 18);
          push(entry.name, "serif", x, room, nameSize);
          push(page, "sans", x + colW - pageW, pageW, fontSize);
        }
        y += lineH + (row === nameRows - 1 ? 0 : rowGap);
      }
    }
    const notes = [
      input.missed ? { text: input.missed, font: "serifItalic" as const } : null,
      input.empty ? { text: "No letters this month.", font: "serifItalic" as const } : null,
    ].filter((note): note is { text: string; font: "serifItalic" } => !!note);
    for (const note of notes) {
      if (lines.length > 0) y += rowGap;
      let noteSize = Math.max(10, fontSize - 2);
      while (noteSize > 8 && measureTextWidth(note.text, noteSize, note.font) > boxW) noteSize -= 0.5;
      push(note.text, note.font, 0, boxW, noteSize);
      y += lineH;
    }
    return lines;
  };
  let lines = build(size, gap);
  let height = tocBlockHeight(lines);
  if (mode === "fill" && fillH > 40) {
    if (height > fillH - 4) {
      while (height > fillH - 4 && size > 9) {
        size -= 0.5;
        lines = build(size, gap);
        height = tocBlockHeight(lines);
      }
    } else if (height < fillH * 0.82) {
      while (size < 22 && tocBlockHeight(build(size + 0.5, gap)) <= fillH - 6) size += 0.5;
      while (gap < 28 && tocBlockHeight(build(size, gap + 1)) <= fillH - 6) gap += 1;
      lines = build(size, gap);
    }
  } else if (fillH > 40 && height > fillH - 4) {
    while (height > fillH - 4 && size > 9) {
      size -= 0.5;
      gap = Math.max(4, gap - 0.5);
      lines = build(size, gap);
      height = tocBlockHeight(lines);
    }
  }
  return lines;
}

type CoverInput = {
  groupUpper: string;
  month: string;
  missed: string;
  theme: CapsuleTheme;
  ink: string;
  empty: boolean;
  toc: ReadonlyArray<{ name: string; page: number }>;
};

function coverTitleLines(input: CoverInput, color: string, titleY: number, titleSize: number): PlacedLine[] {
  const lines: PlacedLine[] = [];
  if (input.theme === "heritage") {
    lines.push({
      text: "A keepsake",
      x: B2_INNER_X,
      y: 12,
      w: B2_INNER_W,
      h: 16,
      size: 13,
      font: "serifItalic",
      color,
      role: "cover",
    });
  }
  let size = titleSize;
  while (size > 16 && measureTextWidth(input.groupUpper, size, "serifBold") > B2_INNER_W) size -= 1;
  lines.push({
    text: input.groupUpper,
    x: B2_INNER_X,
    y: titleY,
    w: B2_INNER_W,
    h: size * 1.15,
    size,
    font: "serifBold",
    color,
    role: "cover",
  });
  return lines;
}

function coverMonthLine(month: string, y: number, color: string): PlacedLine {
  return {
    text: month,
    x: B2_INNER_X,
    y,
    w: B2_INNER_W,
    h: 18,
    size: 14,
    font: "serif",
    color,
    role: "cover",
  };
}

function shiftPack(pack: Pack, x: number, y: number): PlacedPhoto[] {
  return pack.items.map((item) => ({ ...item, x: item.x + x, y: item.y + y }));
}

function placeCoverToc(
  lines: PlacedLine[],
  input: CoverTocInput,
  box: { x: number; y: number; w: number; h: number; color: string; mode: "list" | "mast" | "fill" },
): void {
  const laid = coverTocBlock(input, box.w, box.mode, box.h);
  const blockH = tocBlockHeight(laid);
  if (!(blockH > 0)) return;
  const extra = Math.max(0, box.h - blockH);
  let y0 = box.y + (box.mode === "fill" ? extra / 2 : Math.min(8, extra));
  if (y0 + blockH > box.y + box.h + 0.5) y0 = box.y + Math.max(0, box.h - blockH);
  for (const line of laid) lines.push({ ...line, x: line.x + box.x, y: line.y + y0, color: box.color });
}

const COVER_RAIL = 168;

function buildCoverPage(input: {
  groupUpper: string;
  month: string;
  missed: string;
  theme: CapsuleTheme;
  ink: string;
  accent: string;
  paper: string;
  empty: boolean;
  toc: ReadonlyArray<{ name: string; page: number }>;
  leads: readonly B2Photo[];
}): { lines: PlacedLine[]; photos: PlacedPhoto[]; bands: PageBand[] } {
  const fill = luminance(input.accent) < 170 ? input.accent : input.ink;
  const mastInk = luminance(input.paper) > 180 ? input.paper : "#fffdf8";
  const tocInput: CoverTocInput = { missed: input.missed, empty: input.empty, toc: input.toc };
  if (input.leads.length === 0) {
    const mastH = input.theme === "heritage" ? 168 : 156;
    const lines = coverTitleLines(input, mastInk, Math.max(input.theme === "heritage" ? 32 : 22, (mastH - 46 * 1.15) / 2), 46);
    const cursor = mastH + 16;
    lines.push(coverMonthLine(input.month, cursor, input.ink));
    const tocY = cursor + 26 + (input.empty ? 36 : 40);
    const bands: PageBand[] = [
      { x: 0, y: 0, w: B2_PAGE_W, h: mastH, fill },
      { x: B2_INNER_X, y: tocY - 18, w: 72, h: 3, fill },
    ];
    placeCoverToc(lines, tocInput, {
      x: B2_INNER_X,
      y: tocY,
      w: B2_INNER_W,
      h: Math.max(80, B2_CONTENT_BOTTOM - tocY),
      color: input.ink,
      mode: "list",
    });
    return { lines, photos: [], bands };
  }

  const leads = input.leads.slice(0, 8);
  const shortMast = input.theme === "heritage" ? 92 : 78;
  const photoTop = shortMast + 44;
  const availH = B2_CONTENT_BOTTOM - photoTop;
  type Candidate = {
    area: number;
    ok: boolean;
    lines: PlacedLine[];
    photos: PlacedPhoto[];
    bands: PageBand[];
  };
  const candidates: Candidate[] = [];

  const mastToc = coverTocBlock(tocInput, B2_INNER_W, "mast", 0);
  const mastTocH = tocBlockHeight(mastToc);
  const mastTitleY = input.theme === "heritage" ? 32 : 18;
  const mastMonthY = mastTitleY + 40;
  const mastTocY = mastMonthY + 28;
  const tallMast = mastTocY + mastTocH + 16;
  const mastBoxH = B2_CONTENT_BOTTOM - tallMast;
  const mastPack = bestPack(leads, B2_PAGE_W, mastBoxH);
  if (mastPack && mastBoxH > 80) {
    const side = Math.max(0, (B2_PAGE_W - mastPack.width) / 2);
    const lines = [
      ...coverTitleLines(input, mastInk, mastTitleY, 32),
      coverMonthLine(input.month, mastMonthY, mastInk),
      ...mastToc.map((line) => ({ ...line, x: line.x + B2_INNER_X, y: line.y + mastTocY, color: mastInk })),
    ];
    candidates.push({
      area: packArea(mastPack),
      ok: mastPack.height >= mastBoxH - 8 && side <= B2_PAGE_W * 0.09 && side >= -1,
      lines,
      photos: shiftPack(mastPack, side, tallMast),
      bands: [{ x: 0, y: 0, w: B2_PAGE_W, h: tallMast, fill }],
    });
  }

  const railPack = bestPack(leads, B2_PAGE_W - COVER_RAIL, availH);
  if (railPack && availH > 80) {
    const lines = [
      ...coverTitleLines(input, mastInk, input.theme === "heritage" ? 32 : 22, 32),
      coverMonthLine(input.month, shortMast + 16, input.ink),
    ];
    const photoRight = railPack.width;
    const bands: PageBand[] = [
      { x: 0, y: 0, w: B2_PAGE_W, h: shortMast, fill },
      { x: photoRight, y: photoTop, w: B2_PAGE_W - photoRight, h: availH, fill },
    ];
    if (railPack.height < availH - 2) {
      bands.push({ x: 0, y: photoTop + railPack.height, w: B2_PAGE_W, h: availH - railPack.height, fill });
    }
    placeCoverToc(lines, tocInput, {
      x: photoRight + 16,
      y: photoTop,
      w: Math.max(80, B2_PAGE_W - photoRight - 28),
      h: availH,
      color: mastInk,
      mode: "fill",
    });
    candidates.push({
      area: packArea(railPack),
      ok: railPack.height >= availH - 8,
      lines,
      photos: shiftPack(railPack, 0, photoTop),
      bands,
    });
  }

  const bandPack = bestPack(leads, B2_PAGE_W, Math.max(72, availH - 64));
  if (bandPack) {
    const photoX = Math.max(0, (B2_PAGE_W - bandPack.width) / 2);
    const photoBottom = photoTop + bandPack.height;
    const bandH = B2_CONTENT_BOTTOM - photoBottom;
    const lines = [
      ...coverTitleLines(input, mastInk, input.theme === "heritage" ? 32 : 22, 32),
      coverMonthLine(input.month, shortMast + 16, input.ink),
    ];
    const bands: PageBand[] = [{ x: 0, y: 0, w: B2_PAGE_W, h: shortMast, fill }];
    if (bandH > 8) bands.push({ x: 0, y: photoBottom, w: B2_PAGE_W, h: bandH, fill });
    if (bandH > 36) {
      placeCoverToc(lines, tocInput, {
        x: B2_INNER_X,
        y: photoBottom,
        w: B2_INNER_W,
        h: bandH,
        color: mastInk,
        mode: "fill",
      });
    }
    candidates.push({
      area: packArea(bandPack),
      ok: bandPack.width >= B2_PAGE_W - 10 && bandH >= 56,
      lines,
      photos: shiftPack(bandPack, photoX, photoTop),
      bands,
    });
  }

  const ready = candidates.filter((item) => item.ok);
  const pool = ready.length > 0 ? ready : candidates;
  const chosen = pool.reduce<Candidate | null>((best, item) => (!best || item.area > best.area + 1 ? item : best), null);
  if (!chosen) {
    const mastH = shortMast;
    return {
      lines: [...coverTitleLines(input, mastInk, 22, 32), coverMonthLine(input.month, mastH + 16, input.ink)],
      photos: [],
      bands: [{ x: 0, y: 0, w: B2_PAGE_W, h: mastH, fill }],
    };
  }
  return { lines: chosen.lines, photos: chosen.photos, bands: chosen.bands };
}

/**
 * A short caption under a photo that cannot grow any further (trim limit) sits
 * in an accent plate that runs to the footer, instead of leaving a white band.
 */
function polishShortCaption(
  templateId: string,
  lines: PlacedLine[],
  photos: PlacedPhoto[],
  accent: string,
  ink: string,
  paper: string,
): { lines: PlacedLine[]; bands: PageBand[] } {
  if (CENTRED_PHOTO_TEMPLATES.includes(templateId)) return { lines, bands: [] };
  const body = lines.filter((line) => line.role === "body");
  if (body.length === 0 || photos.length === 0) return { lines, bands: [] };
  const photoBottom = Math.max(...photos.map((photo) => photo.y + photo.h));
  const textTop = Math.min(...body.map((line) => line.y));
  const textBottom = Math.max(...body.map((line) => line.y + line.h));
  if (textTop < photoBottom - 8) return { lines, bands: [] };
  const leftover = B2_CONTENT_BOTTOM - textBottom;
  if (leftover < 52) return { lines, bands: [] };
  const words = body.reduce((sum, line) => sum + wordCount(line.text), 0);
  if (words > 90) return { lines, bands: [] };
  const plate = headerColors("block", ink, accent, paper);
  const bandTop = photoBottom;
  const bandH = B2_CONTENT_BOTTOM - bandTop;
  if (bandH < leftover) return { lines, bands: [] };
  const blockH = textBottom - textTop;
  const innerTop = bandTop + 18;
  const innerBottom = B2_CONTENT_BOTTOM - 16;
  const shift = innerTop + Math.max(0, (innerBottom - innerTop - blockH) / 2) - textTop;
  const moved = lines.map((line) =>
    line.role === "body" ? { ...line, y: line.y + shift, color: plate.text } : line,
  );
  const bodies = moved.filter((line) => line.role === "body");
  const top = Math.min(...bodies.map((line) => line.y));
  const bottom = Math.max(...bodies.map((line) => line.y + line.h));
  if (top < bandTop + 4 || bottom > B2_CONTENT_BOTTOM + 0.5) return { lines, bands: [] };
  if (bodies.some((line) => photos.some((photo) => boxesOverlap(line, photo)))) return { lines, bands: [] };
  return {
    lines: moved,
    bands: [{ x: 0, y: bandTop, w: B2_PAGE_W, h: bandH, fill: plate.fill }],
  };
}

export type LayoutLetter = {
  preferredName: string;
  body: string;
  photos: B2Photo[];
};

export function layoutCapsuleDocument(input: {
  groupName: string;
  monthLabel: string;
  theme: CapsuleTheme;
  letters: readonly LayoutLetter[];
  missedLine: string;
  contributors: string;
}): DocumentPlan {
  void input.contributors;
  const swatch = capsuleThemeMeta(input.theme);
  const paper = swatch.colors[0]!;
  const ink = swatch.colors[1]!;
  const accent = swatch.colors[2]!;
  const letterPages: Array<{
    templateId: string;
    personName: string | null;
    lines: PlacedLine[];
    photos: PlacedPhoto[];
    bands: PageBand[];
  }> = [];
  const toc: Array<{ name: string; page: number }> = [];
  let previous: string | null = null;
  let nextPage = 2;
  for (const letter of input.letters) {
    toc.push({ name: letter.preferredName, page: nextPage });
    const ordered = orderPhotos(letter.photos);
    const built = pickBuilt(ordered, letter.body, ink, previous);
    for (const page of built.pages) {
      const polished = polishShortCaption(built.templateId, page.lines, page.photos, accent, ink, paper);
      letterPages.push({
        templateId: built.templateId,
        personName: letter.preferredName,
        lines: polished.lines,
        photos: page.photos,
        bands: polished.bands,
      });
      previous = built.templateId;
      nextPage += 1;
    }
  }

  const leads = input.letters
    .map((letter) => orderPhotos(letter.photos)[0])
    .filter((photo): photo is B2Photo => !!photo);

  const cover = buildCoverPage({
    groupUpper: input.groupName.toUpperCase(),
    month: input.monthLabel,
    missed: input.missedLine,
    theme: input.theme,
    ink,
    accent,
    paper,
    empty: input.letters.length === 0,
    toc,
    leads,
  });

  const rawPages = [
    { templateId: "cover", personName: null, lines: cover.lines, photos: cover.photos, bands: cover.bands },
    ...letterPages,
  ];

  const pages: PagePlan[] = rawPages.map((page, index) => {
    const headerStyle = HEADER_STYLES[index % HEADER_STYLES.length]!;
    const colors = headerColors(headerStyle, ink, accent, paper);
    const lines = [...page.lines];
    if (page.personName) lines.unshift(placeName(page.personName, headerStyle, colors.text));
    lines.push(...placeFooter(index + 1, input.groupName, input.monthLabel, ink));
    return {
      templateId: page.templateId,
      headerStyle,
      personName: page.personName,
      lines,
      photos: page.photos,
      bands: page.bands,
      paper,
      ink,
      accent,
      headerFill: colors.fill,
      headerInk: colors.text,
    };
  });
  return { pages };
}

export function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) return false;
  return a.x < b.x + b.w - 0.4 && a.x + a.w > b.x + 0.4 && a.y < b.y + b.h - 0.4 && a.y + a.h > b.y + 0.4;
}

export function auditPageContent(page: PagePlan): string[] {
  const problems: string[] = [];
  const body = page.lines.filter((line) => line.role === "body" || line.role === "name" || line.role === "cover");
  for (const line of body) {
    if (line.role !== "cover" && (line.y < B2_CONTENT_TOP - 1 || line.y + line.h > B2_CONTENT_BOTTOM + 1.5)) {
      problems.push(`text outside content: ${line.text.slice(0, 24)}`);
    }
    for (const photo of page.photos) {
      if (boxesOverlap(line, photo)) problems.push(`overlap "${line.text.slice(0, 24)}" / ${photo.storagePath}`);
    }
  }
  for (let i = 0; i < page.photos.length; i += 1) {
    const photo = page.photos[i]!;
    if (photo.x < -1 || photo.y < -1 || photo.x + photo.w > B2_PAGE_W + 1 || photo.y + photo.h > B2_CONTENT_BOTTOM + 1) {
      problems.push(`photo outside page ${photo.storagePath}`);
    }
    if (photo.crop.maxSide > MAX_TRIM + 0.002) problems.push(`trim ${photo.crop.maxSide} ${photo.storagePath}`);
    for (let j = i + 1; j < page.photos.length; j += 1) {
      if (boxesOverlap(photo, page.photos[j]!)) problems.push(`photos overlap ${photo.storagePath}`);
    }
  }
  const footer = page.lines.filter((line) => line.role === "footer");
  if (footer.length < 2) problems.push("missing footer");
  return problems;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
