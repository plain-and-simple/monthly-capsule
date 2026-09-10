import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { CapsuleArchive, CapsuleArchiveLetter } from "@/lib/capsule-archive";
import { groupDisplayName } from "@/lib/copy";
import { capsuleTitle } from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";

export const PDF_CONTENT_TYPE = "application/pdf";
export const DOWNLOAD_PDF_LABEL = "Download PDF";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.102, 0.09, 0.071);
const MUTED = rgb(0.482, 0.447, 0.408);
const RULE = rgb(0.894, 0.867, 0.808);

export type CapsulePdfPhotoBytes = {
  storage_path: string;
  bytes: Uint8Array;
};

export function capsulePdfStoragePath(
  groupId: string,
  yearMonth: string,
  version: number,
): string {
  const edition = Number.isInteger(version) && version >= 1 ? version : 1;
  return `${groupId}/pdfs/${yearMonth}/v${edition}.pdf`;
}

export function capsulePdfFilename(groupName: string, yearMonth: string, version: number): string {
  const slug = groupDisplayName(groupName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const base = slug || "capsule";
  return `${base}-${yearMonth}${version > 1 ? `-v${version}` : ""}.pdf`;
}

export function capsulePdfHref(groupId: string, yearMonth: string, version: number): string {
  const edition = Number.isInteger(version) && version >= 1 ? version : 1;
  if (edition <= 1) return `/g/${groupId}/capsule/${yearMonth}/pdf`;
  return `/g/${groupId}/capsule/${yearMonth}/v${edition}/pdf`;
}

export function detectImageKind(bytes: Uint8Array): "jpeg" | "png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  return null;
}

class PdfCursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    page: PDFPage,
    y: number,
  ) {
    this.page = page;
    this.y = y;
  }

  ensure(needed: number) {
    if (this.y - needed >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  text(
    value: string,
    opts: { font: PDFFont; size: number; color: ReturnType<typeof rgb>; gap?: number },
  ) {
    this.ensure(opts.size + 4);
    this.page.drawText(value, {
      x: MARGIN,
      y: this.y - opts.size,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
    this.y -= opts.size + (opts.gap ?? 0);
  }

  wrapped(
    value: string,
    opts: {
      font: PDFFont;
      size: number;
      lineGap: number;
      color: ReturnType<typeof rgb>;
      paragraphGap?: number;
    },
  ) {
    const lines = wrapLine(value, opts.font, opts.size, CONTENT_WIDTH);
    for (const line of lines) {
      this.text(line, { font: opts.font, size: opts.size, color: opts.color, gap: opts.lineGap });
    }
    if (opts.paragraphGap) this.y -= opts.paragraphGap;
  }

  rule(gapAfter = 20) {
    this.ensure(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 1,
      color: RULE,
    });
    this.y -= gapAfter;
  }

  async image(image: PDFImage) {
    const maxW = CONTENT_WIDTH;
    const maxH = 320;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    this.ensure(drawH + 16);
    this.y -= drawH;
    this.page.drawImage(image, {
      x: MARGIN,
      y: this.y,
      width: drawW,
      height: drawH,
    });
    this.y -= 14;
  }
}

export async function buildCapsulePdfBytes(input: {
  archive: CapsuleArchive;
  photos: readonly CapsulePdfPhotoBytes[];
  monthLabelText?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const photoByPath = new Map(input.photos.map((photo) => [photo.storage_path, photo.bytes]));

  const title =
    input.monthLabelText ??
    capsuleTitle(monthLabel(input.archive.year_month), input.archive.month_version);
  const groupName = groupDisplayName(input.archive.group_name);
  const cursor = new PdfCursor(doc, doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), PAGE_HEIGHT - MARGIN);

  cursor.text(groupName.toUpperCase(), { font: sans, size: 9, color: MUTED, gap: 8 });
  cursor.text(title, { font: serifBold, size: 28, color: INK, gap: 10 });

  const letterCount = input.archive.letters.length;
  const summary =
    letterCount === 0
      ? "No letters this month."
      : `${letterCount} ${letterCount === 1 ? "letter" : "letters"} from ${input.archive.letters
          .map((letter) => letter.preferred_name)
          .join(", ")}`;
  cursor.wrapped(summary, {
    font: sans,
    size: 11,
    lineGap: 3,
    color: MUTED,
    paragraphGap: 8,
  });
  cursor.rule(24);

  if (input.archive.letters.length === 0) {
    cursor.text("No letters this month.", { font: serif, size: 14, color: MUTED });
  } else {
    for (let i = 0; i < input.archive.letters.length; i += 1) {
      await drawLetter(doc, cursor, input.archive.letters[i]!, serif, serifBold, photoByPath);
      if (i < input.archive.letters.length - 1) {
        cursor.y -= 8;
        cursor.rule(20);
      }
    }
  }

  if (input.archive.missed_count > 0) {
    cursor.y -= 12;
    const missed =
      input.archive.missed_count === 1
        ? "1 friend did not write this month."
        : `${input.archive.missed_count} friends did not write this month.`;
    cursor.text(missed, { font: sans, size: 10, color: MUTED });
  }

  return doc.save();
}

async function drawLetter(
  doc: PDFDocument,
  cursor: PdfCursor,
  letter: CapsuleArchiveLetter,
  serif: PDFFont,
  serifBold: PDFFont,
  photoByPath: Map<string, Uint8Array>,
) {
  cursor.text(letter.preferred_name, { font: serifBold, size: 18, color: INK, gap: 12 });

  const body = letter.body.trim();
  if (body) {
    for (const paragraph of body.split(/\n\n+/)) {
      for (const line of paragraph.replace(/\r\n/g, "\n").split("\n")) {
        cursor.wrapped(line || " ", {
          font: serif,
          size: 12,
          lineGap: 4,
          color: INK,
        });
      }
      cursor.y -= 8;
    }
  } else {
    cursor.text("(No letter this month.)", { font: serif, size: 12, color: MUTED, gap: 8 });
  }

  const photos = [...letter.photos].sort((a, b) => a.sort_order - b.sort_order);
  for (const photo of photos) {
    const bytes = photoByPath.get(photo.storage_path);
    if (!bytes) continue;
    const kind = detectImageKind(bytes);
    if (!kind) continue;
    try {
      const image =
        kind === "jpeg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      await cursor.image(image);
    } catch {
      // Skip corrupt or unsupported photo bytes; keep the letter text.
    }
  }
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      const trial = chunk + char;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        chunk = trial;
      } else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}
