import {
  DEFAULT_CAPSULE_THEME,
  layoutPersonSection,
  parseCapsuleTheme,
  plateLabel,
  type CapsuleTheme,
  type LetterBlock,
} from "@/lib/capsule-theme";
import { monthLabel } from "@/lib/schedule";

export const CAPSULE_ARCHIVE_VERSION = 1 as const;

export type CapsuleArchivePhoto = {
  storage_path: string;
  width: number;
  height: number;
  sort_order: number;
};

export type CapsuleArchiveLetter = {
  preferred_name: string;
  body: string;
  photos: CapsuleArchivePhoto[];
};

export type CapsuleArchive = {
  version: typeof CAPSULE_ARCHIVE_VERSION;
  month_version: number;
  year_month: string;
  group_name: string;
  theme: CapsuleTheme;
  html: string;
  letters: CapsuleArchiveLetter[];
  member_count: number;
  missed_count: number;
};

export function capsuleHasArchive(value: unknown): boolean {
  return parseCapsuleArchive(value) !== null;
}

export function parseCapsuleArchive(value: unknown): CapsuleArchive | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CapsuleArchive>;
  if (row.version !== CAPSULE_ARCHIVE_VERSION) return null;
  if (typeof row.year_month !== "string" || !/^\d{4}-\d{2}$/.test(row.year_month)) return null;
  if (typeof row.group_name !== "string") return null;
  if (!Array.isArray(row.letters)) return null;

  const letters: CapsuleArchiveLetter[] = [];
  for (const letter of row.letters) {
    if (!letter || typeof letter !== "object") return null;
    if (typeof letter.preferred_name !== "string" || typeof letter.body !== "string") return null;
    if (!Array.isArray(letter.photos)) return null;
    const photos: CapsuleArchivePhoto[] = [];
    for (const photo of letter.photos) {
      if (!photo || typeof photo !== "object") return null;
      if (typeof photo.storage_path !== "string" || !photo.storage_path) return null;
      if (!Number.isFinite(photo.width) || !Number.isFinite(photo.height)) return null;
      photos.push({
        storage_path: photo.storage_path,
        width: Number(photo.width),
        height: Number(photo.height),
        sort_order: Number(photo.sort_order ?? photos.length),
      });
    }
    letters.push({
      preferred_name: letter.preferred_name,
      body: letter.body,
      photos,
    });
  }

  const memberCount = Number.isFinite(row.member_count) ? Number(row.member_count) : letters.length;
  const missedCount = Number.isFinite(row.missed_count)
    ? Number(row.missed_count)
    : Math.max(0, memberCount - letters.length);
  const monthVersion = Number.isInteger(row.month_version) && Number(row.month_version) >= 1
    ? Number(row.month_version)
    : 1;
  const theme = parseCapsuleTheme(row.theme);

  return {
    version: CAPSULE_ARCHIVE_VERSION,
    month_version: monthVersion,
    year_month: row.year_month,
    group_name: row.group_name,
    theme,
    html: typeof row.html === "string" ? row.html : renderArchiveHtml({
      year_month: row.year_month,
      group_name: row.group_name,
      letters,
      month_version: monthVersion,
      theme,
    }),
    letters,
    member_count: memberCount,
    missed_count: missedCount,
  };
}

export function buildCapsuleArchive(input: {
  yearMonth: string;
  groupName: string;
  letters: CapsuleArchiveLetter[];
  memberCount: number;
  monthVersion?: number;
  theme?: CapsuleTheme;
}): CapsuleArchive {
  const monthVersion =
    Number.isInteger(input.monthVersion) && Number(input.monthVersion) >= 1
      ? Number(input.monthVersion)
      : 1;
  const theme = parseCapsuleTheme(input.theme);
  const letters = input.letters.map((letter) => ({
    preferred_name: letter.preferred_name,
    body: letter.body,
    photos: letter.photos.map((photo, index) => ({
      storage_path: photo.storage_path,
      width: photo.width,
      height: photo.height,
      sort_order: photo.sort_order ?? index,
    })),
  }));
  const snapshot = {
    year_month: input.yearMonth,
    group_name: input.groupName,
    letters,
    month_version: monthVersion,
    theme,
  };
  return {
    version: CAPSULE_ARCHIVE_VERSION,
    ...snapshot,
    html: renderArchiveHtml(snapshot),
    member_count: input.memberCount,
    missed_count: Math.max(0, input.memberCount - letters.length),
  };
}

export function capsuleViewSource(
  archive: unknown,
  live: CapsuleArchiveLetter[],
): { letters: CapsuleArchiveLetter[]; source: "archive" | "live"; archive: CapsuleArchive | null } {
  const parsed = parseCapsuleArchive(archive);
  if (parsed) {
    return { letters: parsed.letters, source: "archive", archive: parsed };
  }
  return { letters: live, source: "live", archive: null };
}

export function renderArchiveHtml(input: {
  year_month: string;
  group_name: string;
  letters: CapsuleArchiveLetter[];
  month_version?: number;
  theme?: CapsuleTheme;
}): string {
  const theme = parseCapsuleTheme(input.theme);
  const monthVersion =
    Number.isInteger(input.month_version) && Number(input.month_version) >= 1
      ? Number(input.month_version)
      : 1;
  const labeled = monthLabel(input.year_month);
  const cover = renderCoverHtml({
    theme,
    groupName: input.group_name,
    monthLabel: labeled,
    names: input.letters.map((letter) => letter.preferred_name),
  });
  const sections = input.letters
    .map((letter) => renderPersonSectionHtml(theme, letter))
    .join("");
  return `<article class="capsule capsule--${theme}" data-theme="${theme}" data-year-month="${escapeAttr(input.year_month)}" data-month-version="${monthVersion}">${cover}${sections}</article>`;
}

function renderCoverHtml(input: {
  theme: CapsuleTheme;
  groupName: string;
  monthLabel: string;
  names: string[];
}): string {
  const names = input.names
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join("");
  const contents =
    input.names.length > 0
      ? `<ul class="capsule__contents capsule__contents--${input.theme}">${names}</ul>`
      : "";

  if (input.theme === "warm") {
    return `<header class="capsule__cover"><p class="capsule__ribbon">${escapeHtml(input.monthLabel)}</p><h1>${escapeHtml(input.groupName)}</h1><p class="capsule__cover-note">Letters and photographs, kept together.</p>${contents}</header>`;
  }
  if (input.theme === "minimal") {
    return `<header class="capsule__cover"><p class="capsule__kicker">Capsule</p><h1>${escapeHtml(input.monthLabel)}</h1><p class="capsule__cover-note">${escapeHtml(input.groupName)}</p>${contents}</header>`;
  }
  if (input.theme === "heritage") {
    return `<header class="capsule__cover"><div class="capsule__ornament" aria-hidden="true">❧</div><p class="capsule__kicker">A keepsake</p><h1>${escapeHtml(input.monthLabel)}</h1><p class="capsule__cover-note">${escapeHtml(input.groupName)}</p>${contents}<div class="capsule__ornament" aria-hidden="true">❧</div></header>`;
  }
  return `<header class="capsule__cover"><p class="eyebrow">${escapeHtml(input.groupName)}</p><h1>${escapeHtml(input.monthLabel)}</h1>${contents}</header>`;
}

function renderPersonSectionHtml(theme: CapsuleTheme, letter: CapsuleArchiveLetter): string {
  const layout = theme === "classic"
    ? "letter-then-photos"
    : theme === "warm"
      ? "photos-woven"
      : theme === "minimal"
        ? "text-then-strip"
        : "letter-then-plates";
  const inner = layoutPersonSection(theme, letter).map((block) => renderBlockHtml(block)).join("");
  return `<section class="letter letter--${theme}" data-author="${escapeAttr(letter.preferred_name)}" data-layout="${layout}">${inner}</section>`;
}

function renderBlockHtml(block: LetterBlock): string {
  if (block.kind === "heading") {
    return `<h2>${escapeHtml(block.name)}</h2>`;
  }
  if (block.kind === "text") {
    const body = escapeHtml(block.text).replace(/\n/g, "<br />");
    return `<p class="letter__text">${body}</p>`;
  }
  if (block.kind === "gallery") {
    const images = block.photos.map(renderPhotoImg).join("");
    return `<div class="letter__photos letter__photos--${block.variant}">${images}</div>`;
  }
  const img = renderPhotoImg(block.photo);
  if (block.variant === "plate") {
    const caption = plateLabel(block.plateIndex ?? 0);
    return `<figure class="letter__plate">${img}<figcaption>${caption}</figcaption></figure>`;
  }
  return `<figure class="letter__photo letter__photo--weave">${img}</figure>`;
}

function renderPhotoImg(photo: CapsuleArchivePhoto): string {
  return `<div class="photo"><img data-storage-path="${escapeAttr(photo.storage_path)}" width="${photo.width}" height="${photo.height}" alt="" /></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
