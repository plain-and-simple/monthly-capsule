import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDF_FONTS_DIR } from "@/lib/capsule-pdf-fonts";
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

export type PagePlan = {
  templateId: string;
  headerStyle: HeaderStyle;
  personName: string | null;
  lines: PlacedLine[];
  photos: PlacedPhoto[];
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
export const B2_CONTENT_BOTTOM = B2_PAGE_H - B2_FOOTER_H - 6;
export const B2_INNER_X = B2_MARGIN_X;
export const B2_INNER_W = B2_PAGE_W - B2_MARGIN_X * 2;
export const B2_BODY_TOP = B2_CONTENT_TOP + B2_HEADER_H + 8;
export const B2_AVAIL = B2_CONTENT_BOTTOM - B2_BODY_TOP;
export const MAX_TRIM = 0.1;
export const FACE_PAD = 0.02;
export const MIN_FACE_AREA = 0.003;
export const TEMPLATE_REPEAT_PENALTY = 2.5;
export const SPREAD_WORD_MIN = 650;
export const HEADER_STYLES: readonly HeaderStyle[] = ["rule", "block", "serif"];

const BODY_FONTS = [14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5];
const DISPLAY_FONTS = [22, 20, 18, 16, 15, 14, 13, 12, 11, 10.5];
const ONE_LINE_FONTS = [46, 40, 36, 32, 28, 24];
const ROW_GAP = 8;

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
    const emoji = loadFace("NotoEmoji-Variable.ttf");
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
}): number {
  let score = input.affinity;
  score -= input.blankRatio * 8;
  score -= Math.max(0, 12.5 - input.fontSize) * 1.2;
  score -= input.meanCrop * 4;
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
      const extra = line.paraBreakBefore ? paraGap : 0;
      if (column < columns - 1 && y + extra + lineHeight - columnStart > target + 0.2 && y > columnStart) {
        column += 1;
        y = input.y;
        columnStart = input.y;
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
  let hi = input.size * 1.62;
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

function markLead(photos: PlacedPhoto[], ordered: readonly B2Photo[]): PlacedPhoto[] {
  if (photos.length === 0) return photos;
  const hero = ordered[0];
  if (!hero) return photos;
  const next = photos.map((photo) => ({ ...photo, lead: false }));
  let largest = 0;
  next.forEach((photo, index) => {
    if (photo.w * photo.h > next[largest]!.w * next[largest]!.h + 0.5) largest = index;
  });
  const heroIndex = next.findIndex((photo) => photo.storagePath === hero.storagePath);
  if (heroIndex < 0) {
    next[largest] = placeInSlot(hero, next[largest]!, true);
    return next;
  }
  if (heroIndex !== largest) {
    const displacedPath = next[largest]!.storagePath;
    const displaced = ordered.find((photo) => photo.storagePath === displacedPath);
    const heroSlot = next[heroIndex]!;
    const largeSlot = next[largest]!;
    next[largest] = placeInSlot(hero, largeSlot, true);
    if (displaced) next[heroIndex] = placeInSlot(displaced, heroSlot, false);
  } else {
    next[heroIndex] = { ...next[heroIndex]!, lead: true };
  }
  return next;
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
};

function statsFor(
  photos: PlacedPhoto[],
  ordered: readonly B2Photo[],
  blank: number,
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
  return {
    templateId,
    fontSize,
    blankRatio: clamp(blank / B2_AVAIL, 0, 1),
    meanCrop,
    heroIsLargest,
    objectIsBiggest,
    hasPerson,
    affinity,
  };
}

function finishSingle(
  templateId: B2TemplateId,
  ordered: readonly B2Photo[],
  photos: PlacedPhoto[],
  lines: PlacedLine[],
  fontSize: number,
  affinity: number,
): Built {
  const bottom = Math.max(
    B2_BODY_TOP,
    ...photos.map((photo) => photo.y + photo.h),
    ...lines.map((line) => line.y + line.h),
  );
  const blank = Math.max(0, B2_CONTENT_BOTTOM - bottom);
  const marked = markLead(photos, ordered);
  return {
    ...statsFor(marked, ordered, blank, fontSize, affinity, templateId),
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
    return finishSingle(input.templateId, input.ordered, photos, flowed.lines, size, input.affinity);
  }
  return null;
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
  const photoW = Math.min(B2_INNER_W * 0.48, B2_AVAIL * 0.92 * aspect);
  const photoH = photoW / aspect;
  const textX = B2_INNER_X + photoW + 14;
  const textW = B2_INNER_X + B2_INNER_W - textX;
  if (textW < 80) return null;
  for (const size of BODY_FONTS) {
    const beside = text.trim()
      ? flowText({
          text,
          x: textX,
          y: B2_BODY_TOP,
          w: textW,
          h: Math.max(photoH, B2_AVAIL),
          columns: 1,
          size,
          fill: photoH >= B2_AVAIL * 0.75,
          color: ink,
        })
      : { lines: [] as PlacedLine[], used: 0 };
    if (!beside) continue;
    if (beside.used > B2_AVAIL + 0.5) continue;
    const slotH = Math.max(photoH, Math.min(beside.used, B2_AVAIL));
    const slotW = Math.min(photoW, slotH * aspect);
    const photos: PlacedPhoto[] = [
      {
        storagePath: hero.storagePath,
        x: B2_INNER_X,
        y: B2_BODY_TOP,
        w: slotW,
        h: slotH * aspect <= slotW + 1 ? slotH : slotW / aspect,
        crop: { ...ZERO_CROP },
        fit: "cover",
        lead: true,
      },
    ];
    photos[0]!.h = photos[0]!.w / aspect;
    if (photos[0]!.y + photos[0]!.h > B2_CONTENT_BOTTOM) {
      photos[0]!.h = B2_CONTENT_BOTTOM - photos[0]!.y;
      photos[0]!.w = photos[0]!.h * aspect;
    }
    return finishSingle("portrait-feature", ordered, photos, beside.lines, size, 1.45);
  }
  return null;
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
  const columnW = B2_INNER_W * 0.36;
  const textW = B2_INNER_W - columnW - 12;
  let heights = ordered.map((photo) => columnW / (photo.width / Math.max(1, photo.height)));
  let stack = heights.reduce((sum, height) => sum + height, 0) + ROW_GAP * (ordered.length - 1);
  if (stack > B2_AVAIL * 0.92) {
    const scale = (B2_AVAIL * 0.86) / stack;
    const next = ordered.map((photo, index) => {
      const height = heights[index]! * scale;
      const aspect = columnW / height;
      return placeCrop(photo, aspect);
    });
    if (next.some((crop) => crop.letterbox || crop.maxSide > MAX_TRIM + 0.002)) return null;
    heights = heights.map((height) => height * scale);
    stack = heights.reduce((sum, height) => sum + height, 0) + ROW_GAP * (ordered.length - 1);
  }
  for (const size of BODY_FONTS) {
    const flowed = flowText({
      text,
      x: B2_INNER_X,
      y: B2_BODY_TOP,
      w: textW,
      h: Math.max(stack, size * 2),
      columns: 1,
      size,
      fill: false,
      color: ink,
    });
    if (!flowed) continue;
    if (flowed.used > stack + 1 && stack + B2_GAP + (flowed.used - stack) > B2_AVAIL) continue;
    const textBottom = B2_BODY_TOP + Math.max(stack, flowed.used);
    if (textBottom > B2_CONTENT_BOTTOM + 0.5) continue;
    let y = B2_BODY_TOP;
    const photos: PlacedPhoto[] = ordered.map((photo, index) => {
      const height = heights[index]!;
      const aspect = columnW / height;
      const crop = placeCrop(photo, aspect);
      const placed: PlacedPhoto = {
        storagePath: photo.storagePath,
        x: B2_INNER_X + textW + 12,
        y,
        w: columnW,
        h: height,
        crop: crop.letterbox ? { ...ZERO_CROP, letterbox: true } : crop,
        fit: crop.letterbox ? "contain" : "cover",
        lead: false,
      };
      y += height + ROW_GAP;
      return placed;
    });
    const lines =
      flowed.used <= stack + 1
        ? flowed.lines
        : flowed.lines;
    return finishSingle("side-stack", ordered, photos, lines, size, 0.15);
  }
  return null;
}

function buildMosaic(ordered: B2Photo[], text: string, ink: string): Built | null {
  if (ordered.length < 3 || ordered.length > 6) return null;
  const hero = ordered[0]!;
  if (hero.width / hero.height >= 0.95 || isExtreme(hero)) return null;
  const right = ordered.slice(1, 5);
  const below = ordered.slice(1 + right.length);
  if (below.length === 1) return null;
  const heroAspect = hero.width / hero.height;
  let heroW = B2_INNER_W * 0.5;
  let heroH = heroW / heroAspect;
  const maxH = B2_AVAIL * 0.7;
  if (heroH > maxH) {
    heroH = maxH;
    heroW = heroH * heroAspect;
  }
  const rightW = B2_INNER_W - heroW - ROW_GAP;
  if (rightW < 70) return null;
  const cellH = (heroH - ROW_GAP * (right.length - 1)) / right.length;
  if (cellH < 36) return null;
  const photos: PlacedPhoto[] = [
    {
      storagePath: hero.storagePath,
      x: 0,
      y: 0,
      w: heroW,
      h: heroH,
      crop: { ...ZERO_CROP },
      fit: "cover",
      lead: true,
    },
  ];
  right.forEach((photo, index) => {
    const slotAspect = rightW / cellH;
    const crop = placeCrop(photo, slotAspect);
    photos.push({
      storagePath: photo.storagePath,
      x: heroW + ROW_GAP,
      y: index * (cellH + ROW_GAP),
      w: rightW,
      h: cellH,
      crop: crop.letterbox ? letterboxCrop() : crop,
      fit: crop.letterbox ? "contain" : "cover",
      lead: false,
    });
  });
  let blockH = heroH;
  if (below.length > 0) {
    const row = rowBlock(below, [below.length], B2_INNER_W, 0.35);
    if (!row) return null;
    const capped = row.height > 150 ? scaleBlockTo(row, 150) : row;
    for (const item of capped.items) {
      photos.push({ ...item, y: item.y + blockH + ROW_GAP });
    }
    blockH += ROW_GAP + capped.height;
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
  const photoBudget = B2_AVAIL * 0.62;
  for (const size of ONE_LINE_FONTS) {
    const width = measureTextWidth(trimmed, size, "serif");
    if (width > B2_INNER_W) continue;
    const natural = exactSlots(ordered, (photo) => {
      const aspect = photo.width / Math.max(1, photo.height);
      return aspect < 0.5 ? B2_INNER_W * 0.42 : B2_INNER_W;
    });
    if (!natural) continue;
    const fitted = scaleBlockTo(natural, photoBudget);
    const photos = shiftBlock(fitted, B2_INNER_X, B2_BODY_TOP);
    const textY = B2_BODY_TOP + fitted.height + B2_GAP;
    const textH = B2_CONTENT_BOTTOM - textY;
    if (textH < size * 1.15) continue;
    const line: PlacedLine = {
      text: trimmed,
      x: B2_INNER_X + (B2_INNER_W - width) / 2,
      y: textY + Math.max(0, (textH - size * 1.2) / 2),
      w: width,
      h: size * 1.2,
      size,
      font: "serif",
      color: ink,
      role: "body",
    };
    return finishSingle("one-line", ordered, photos, [line], size, 6);
  }
  return null;
}

function buildTextPage(text: string, ink: string, templateId: B2TemplateId, affinity: number, top = B2_BODY_TOP, height = B2_AVAIL): { lines: PlacedLine[]; fontSize: number } | null {
  const fonts = wordCount(text) < 80 ? DISPLAY_FONTS : BODY_FONTS;
  const columns = columnsFor(text);
  for (const size of fonts) {
    const flowed = flowText({
      text,
      x: B2_INNER_X,
      y: top,
      w: B2_INNER_W,
      h: height,
      columns,
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
  const page = buildTextPage(text, ink, "text-only", 1.4);
  if (!page) return null;
  return finishSingle("text-only", [], [], page.lines, page.fontSize, 1.4);
}

function fitTokenCount(tokens: readonly Token[], height: number, limit: number): number {
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
    const needed = textHeight(chunk, 10.5, B2_INNER_W, columnsFor(chunk));
    if (needed != null && needed <= height + 0.5) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function buildSpread(ordered: B2Photo[], text: string, ink: string, force: boolean): Built | null {
  const tokens = tokenize(text);
  if (!force && tokens.length < SPREAD_WORD_MIN) return null;

  let photoBlock: Block | null = null;
  if (ordered.length > 0) {
    const rows = ordered.some(isExtreme)
      ? null
      : rowBlock(ordered, magazineRowCounts(ordered.length), B2_INNER_W, 0.85);
    const exact = exactSlots(ordered, (photo) => {
      const aspect = photo.width / Math.max(1, photo.height);
      return aspect < 0.5 ? B2_INNER_W * 0.34 : B2_INNER_W;
    });
    const base = rows ?? exact;
    if (base) photoBlock = scaleBlockTo(base, Math.min(B2_AVAIL * 0.4, 250));
  }

  const pages: Built["pages"] = [];
  let cursor = 0;
  const minPages = tokens.length >= SPREAD_WORD_MIN ? 2 : 1;
  let guard = 0;
  while (cursor < tokens.length && guard < 16) {
    guard += 1;
    const first = pages.length === 0;
    const top = first && photoBlock ? B2_BODY_TOP + photoBlock.height + B2_GAP : B2_BODY_TOP;
    const height = Math.max(24, B2_CONTENT_BOTTOM - top);
    const remaining = tokens.slice(cursor);
    let limit = remaining.length;
    if (minPages >= 2 && first && remaining.length > 1) {
      limit = Math.max(1, Math.min(limit, Math.ceil(tokens.length / 2)));
    }
    let take = fitTokenCount(remaining, height, limit);
    if (take < 1) take = 1;
    let flowed = buildTextPage(joinTokens(remaining.slice(0, take)), ink, "spread", 0, top, height);
    while (!flowed && take > 1) {
      take -= 1;
      flowed = buildTextPage(joinTokens(remaining.slice(0, take)), ink, "spread", 0, top, height);
    }
    if (!flowed) return null;
    pages.push({
      lines: flowed.lines,
      photos: first && photoBlock ? shiftBlock(photoBlock, B2_INNER_X, B2_BODY_TOP) : [],
    });
    cursor += take;
  }
  if (cursor < tokens.length || pages.length < minPages) return null;
  const fontSize = Math.min(...pages.flatMap((page) => page.lines.map((line) => line.size).concat(12)));
  const blanks = pages.map((page) => {
    const bottom = Math.max(
      B2_BODY_TOP,
      ...page.photos.map((photo) => photo.y + photo.h),
      ...page.lines.map((line) => line.y + line.h),
    );
    return Math.max(0, B2_CONTENT_BOTTOM - bottom);
  });
  const blank = blanks.reduce((sum, value) => sum + value, 0) / Math.max(1, blanks.length);
  const markedPages = pages.map((page) => ({
    ...page,
    photos: markLead(page.photos, ordered),
  }));
  return {
    ...statsFor(markedPages.flatMap((page) => page.photos), ordered, blank, fontSize, force ? 0.2 : 1.6, "spread"),
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
        fonts: [18, 16, 15, 14, 13, 12],
        columns: 1,
        block: () => {
          const slotW = Math.min(B2_INNER_W * 0.78, B2_AVAIL * 0.55 * aspect);
          const natural = exactSlots(ordered, () => slotW);
          return natural ? scaleBlockTo(natural, B2_AVAIL * 0.62) : null;
        },
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
        fonts: BODY_FONTS,
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

function coverLines(input: {
  groupName: string;
  groupUpper: string;
  month: string;
  contributors: string;
  missed: string;
  theme: CapsuleTheme;
  ink: string;
  accent: string;
  empty: boolean;
}): PlacedLine[] {
  const lines: PlacedLine[] = [];
  let y = 48;
  if (input.theme === "heritage") {
    lines.push({
      text: "A keepsake",
      x: B2_INNER_X,
      y,
      w: B2_INNER_W,
      h: 18,
      size: 14,
      font: "serifItalic",
      color: input.accent,
      role: "cover",
    });
    y += 28;
  }
  let size = 36;
  while (size > 16 && measureTextWidth(input.groupUpper, size, "serifBold") > B2_INNER_W) size -= 1;
  lines.push({
    text: input.groupUpper,
    x: B2_INNER_X,
    y,
    w: B2_INNER_W,
    h: size * 1.05,
    size,
    font: "serifBold",
    color: input.ink,
    role: "cover",
  });
  y += size + 14;
  lines.push({
    text: input.month,
    x: B2_INNER_X,
    y,
    w: B2_INNER_W,
    h: 18,
    size: 14,
    font: "serif",
    color: input.ink,
    role: "cover",
  });
  y += 28;
  lines.push({
    text: input.groupName,
    x: B2_INNER_X,
    y,
    w: B2_INNER_W,
    h: 16,
    size: 12,
    font: "sans",
    color: input.ink,
    role: "cover",
  });
  y += 28;
  if (input.contributors) {
    const wrapped = wrapParagraph(input.contributors, 12, B2_INNER_W, "serif");
    for (const line of wrapped) {
      lines.push({
        text: line,
        x: B2_INNER_X,
        y,
        w: B2_INNER_W,
        h: 16,
        size: 12,
        font: "serif",
        color: input.ink,
        role: "cover",
      });
      y += 18;
    }
    y += 8;
  }
  if (input.missed) {
    lines.push({
      text: input.missed,
      x: B2_INNER_X,
      y,
      w: B2_INNER_W,
      h: 16,
      size: 11,
      font: "serifItalic",
      color: input.ink,
      role: "cover",
    });
    y += 28;
  }
  if (input.empty) {
    lines.push({
      text: "No letters this month.",
      x: B2_INNER_X,
      y: Math.max(y + 12, 280),
      w: B2_INNER_W,
      h: 20,
      size: 14,
      font: "serifItalic",
      color: input.ink,
      role: "cover",
    });
  }
  return lines;
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
  const swatch = capsuleThemeMeta(input.theme);
  const paper = swatch.colors[0]!;
  const ink = swatch.colors[1]!;
  const accent = swatch.colors[2]!;
  const rawPages: Array<{ templateId: string; personName: string | null; lines: PlacedLine[]; photos: PlacedPhoto[] }> = [];
  rawPages.push({
    templateId: "cover",
    personName: null,
    lines: coverLines({
      groupName: input.groupName,
      groupUpper: input.groupName.toUpperCase(),
      month: input.monthLabel,
      contributors: input.contributors,
      missed: input.missedLine,
      theme: input.theme,
      ink,
      accent,
      empty: input.letters.length === 0,
    }),
    photos: [],
  });

  let previous: string | null = null;
  for (const letter of input.letters) {
    const ordered = orderPhotos(letter.photos);
    const built = pickBuilt(ordered, letter.body, ink, previous);
    for (const page of built.pages) {
      rawPages.push({
        templateId: built.templateId,
        personName: letter.preferredName,
        lines: page.lines,
        photos: page.photos,
      });
      previous = built.templateId;
    }
  }

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
  const body = page.lines.filter((line) => line.role === "body" || line.role === "name");
  for (const line of body) {
    if (line.y < B2_CONTENT_TOP - 1 || line.y + line.h > B2_CONTENT_BOTTOM + 1.5) {
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
