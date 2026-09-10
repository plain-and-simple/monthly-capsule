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

  return {
    version: CAPSULE_ARCHIVE_VERSION,
    month_version: monthVersion,
    year_month: row.year_month,
    group_name: row.group_name,
    html: typeof row.html === "string" ? row.html : renderArchiveHtml({
      year_month: row.year_month,
      group_name: row.group_name,
      letters,
      month_version: monthVersion,
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
}): CapsuleArchive {
  const monthVersion =
    Number.isInteger(input.monthVersion) && Number(input.monthVersion) >= 1
      ? Number(input.monthVersion)
      : 1;
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
}): string {
  const sections = input.letters
    .map((letter) => {
      const photos = letter.photos
        .map(
          (photo) =>
            `<img data-storage-path="${escapeAttr(photo.storage_path)}" width="${photo.width}" height="${photo.height}" alt="" />`,
        )
        .join("");
      const body = escapeHtml(letter.body).replace(/\n/g, "<br />");
      return `<section><h2>${escapeHtml(letter.preferred_name)}</h2><p>${body}</p>${photos}</section>`;
    })
    .join("");
  const monthVersion =
    Number.isInteger(input.month_version) && Number(input.month_version) >= 1
      ? Number(input.month_version)
      : 1;
  return `<article data-year-month="${escapeAttr(input.year_month)}" data-month-version="${monthVersion}"><h1>${escapeHtml(input.group_name)}</h1>${sections}</article>`;
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
