import sharp from "sharp";
import { buildCapsuleArchive, type CapsuleArchive } from "@/lib/capsule-archive";
import type { CapsulePdfPhotoBytes } from "@/lib/capsule-pdf";
import type { CapsuleTheme } from "@/lib/capsule-theme";

/** Synthetic visual-check letters only. Never real users' writing or photos. */
export const PDF_VISUAL_YEAR_MONTH = "2026-10";
export const PDF_VISUAL_GROUP = "Regression Kitchen";

export const BULLET_BODY = [
  "- rye bread from the Saturday stall",
  "- two slightly soft pears",
  "- a small jar of honey",
  "- leftover mint in a jam jar",
  "- the blue bowl we keep by the sink",
].join("\n");

export const LONG_BODY = [
  "The river path stayed muddy after the storm, so we took the long way around the school and talked about the porch light that has been blinking since August. Someone had left a chair out and the seat was a dark oval of rainwater. We stood there longer than we meant to, just watching the maple drop one leaf at a time onto the wet sidewalk.",
  "Later the kitchen windows fogged while the beans simmered and the radio kept losing the station. I wrote this down so October would still have the smell of that pot and the sound of the back door that never quite latches unless you lean on it.",
].join("\n\n");

export const GALLERY_BODY = "One short note about the porch light and the extra pictures from the walk.";

export const TEN_LINE_OPENING = Array.from({ length: 10 }, (_, index) => {
  return `Line ${index + 1} stays with the name heading.`;
}).join("\n");

export const KEEP_TARGET_BODY = [
  TEN_LINE_OPENING,
  "A second thought after the heading is already safe on the next page.",
].join("\n\n");

export function fillerBody(paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, index) => {
    const n = index + 1;
    return `Filler paragraph ${n} is only here to push the next name toward the bottom of a page so the keep-with-next rule can be checked. It is synthetic regression copy, not a real letter.`;
  }).join("\n\n");
}

export type VisualLetterSpec = {
  preferred_name: string;
  body: string;
  photos: Array<{ color: string; width: number; height: number }>;
};

export const VISUAL_LETTERS: VisualLetterSpec[] = [
  {
    preferred_name: "Alex Rivera",
    body: BULLET_BODY,
    photos: [
      { color: "#2f5b4c", width: 1200, height: 800 },
      { color: "#c47a3a", width: 900, height: 1400 },
      { color: "#8a6a32", width: 1100, height: 700 },
      { color: "#6b2e1f", width: 800, height: 1200 },
    ],
  },
  {
    preferred_name: "Jordan Lee",
    body: LONG_BODY,
    photos: [
      { color: "#1a1712", width: 1400, height: 900 },
      { color: "#2f5b4c", width: 900, height: 1300 },
    ],
  },
  {
    preferred_name: "Sam Patel",
    body: GALLERY_BODY,
    photos: [
      { color: "#b5b5b0", width: 800, height: 1200 },
      { color: "#c47a3a", width: 700, height: 1100 },
      { color: "#8a6a32", width: 900, height: 1400 },
      { color: "#2f5b4c", width: 1200, height: 800 },
      { color: "#6b2e1f", width: 850, height: 1250 },
    ],
  },
  {
    preferred_name: "Casey Nguyen",
    body: fillerBody(18),
    photos: [],
  },
  {
    preferred_name: "Riley Chen",
    body: KEEP_TARGET_BODY,
    photos: [{ color: "#2f5b4c", width: 1000, height: 750 }],
  },
];

export async function makeSwatchJpeg(
  color: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

export const KEEP_FILLER_COUNT = 29;

export async function buildKeepArchive(
  theme: CapsuleTheme,
  fillerCount = KEEP_FILLER_COUNT,
): Promise<{
  archive: CapsuleArchive;
  photos: CapsulePdfPhotoBytes[];
}> {
  const storage_path = `visual/${theme}/keep/0.jpg`;
  const bytes = await makeSwatchJpeg("#2f5b4c", 1000, 750);
  return {
    archive: buildCapsuleArchive({
      yearMonth: PDF_VISUAL_YEAR_MONTH,
      groupName: PDF_VISUAL_GROUP,
      memberCount: 2,
      theme,
      letters: [
        { preferred_name: "Casey Nguyen", body: fillerBody(fillerCount), photos: [] },
        {
          preferred_name: "Riley Chen",
          body: KEEP_TARGET_BODY,
          photos: [{ storage_path, width: 1000, height: 750, sort_order: 0 }],
        },
      ],
    }),
    photos: [{ storage_path, bytes }],
  };
}

export async function buildVisualArchive(theme: CapsuleTheme): Promise<{
  archive: CapsuleArchive;
  photos: CapsulePdfPhotoBytes[];
}> {
  const photos: CapsulePdfPhotoBytes[] = [];
  const letters = [];
  for (const [letterIndex, spec] of VISUAL_LETTERS.entries()) {
    const letterPhotos = [];
    for (const [photoIndex, swatch] of spec.photos.entries()) {
      const storage_path = `visual/${theme}/${letterIndex}/${photoIndex}.jpg`;
      photos.push({
        storage_path,
        bytes: await makeSwatchJpeg(swatch.color, swatch.width, swatch.height),
      });
      letterPhotos.push({
        storage_path,
        width: swatch.width,
        height: swatch.height,
        sort_order: photoIndex,
      });
    }
    letters.push({
      preferred_name: spec.preferred_name,
      body: spec.body,
      photos: letterPhotos,
    });
  }
  return {
    archive: buildCapsuleArchive({
      yearMonth: PDF_VISUAL_YEAR_MONTH,
      groupName: PDF_VISUAL_GROUP,
      memberCount: VISUAL_LETTERS.length,
      theme,
      letters,
    }),
    photos,
  };
}
