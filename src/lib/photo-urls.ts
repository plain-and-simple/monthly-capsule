export type SignedUrlRow = {
  path?: string | null;
  signedUrl?: string | null;
  error?: string | null;
};

export function mapSignedUrlRows(
  paths: readonly string[],
  rows: readonly SignedUrlRow[] | null | undefined,
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const path of paths) {
    result.set(path, null);
  }
  for (const row of rows ?? []) {
    if (!row.path || row.error || !row.signedUrl) continue;
    result.set(row.path, row.signedUrl);
  }
  return result;
}
