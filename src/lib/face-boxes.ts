/** Normalized face box, origin top-left, fractions of the photo. */
export type FaceBox = { x: number; y: number; w: number; h: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Drop garbage. A missing or empty list means the PDF trims evenly. */
export function parseFaceBoxes(value: unknown): FaceBox[] {
  if (!Array.isArray(value)) return [];
  const boxes: FaceBox[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const box = item as Record<string, unknown>;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;
    if (w <= 0.005 || h <= 0.005) continue;
    if (x < -0.05 || y < -0.05 || x > 1.05 || y > 1.05) continue;
    const left = clamp(x, 0, 1);
    const top = clamp(y, 0, 1);
    boxes.push({
      x: left,
      y: top,
      w: clamp(w, 0, 1 - left),
      h: clamp(h, 0, 1 - top),
    });
    if (boxes.length >= 12) break;
  }
  return boxes;
}

/** Hidden submit field: one face-box list per newly uploaded file, in file order. */
export function parsePhotoFacesList(value: unknown): FaceBox[][] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 6).map((item) => parseFaceBoxes(item));
  } catch {
    return [];
  }
}
