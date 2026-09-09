const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function parseGroupId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromJoin = trimmed.match(
    /\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  if (fromJoin) {
    return fromJoin[1].toLowerCase();
  }

  const match = trimmed.match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}
