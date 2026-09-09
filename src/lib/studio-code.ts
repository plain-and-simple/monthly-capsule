export const DEFAULT_CREATE_GROUP_CODE = "plainandsimple";
export const STUDIO_CODE_ERROR = "That code doesn’t work";

export function resolveCreateGroupCode(envValue: string | undefined): string {
  const trimmed = envValue?.trim();
  return trimmed ? trimmed : DEFAULT_CREATE_GROUP_CODE;
}

export function studioCodeMatches(input: string, expected: string): boolean {
  return input.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function rejectInvalidStudioCode(
  input: string,
  expected: string,
): { ok: false; error: typeof STUDIO_CODE_ERROR } | null {
  if (!studioCodeMatches(input, expected)) {
    return { ok: false, error: STUDIO_CODE_ERROR };
  }
  return null;
}
