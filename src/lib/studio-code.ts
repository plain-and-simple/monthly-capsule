export const DEFAULT_CREATE_GROUP_CODE = "plainandsimple";
export const STUDIO_CODE_ERROR = "That code doesn’t work";

export function resolveCreateGroupCode(
  envValue: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  const trimmed = envValue?.trim() ?? "";
  const publicFallback =
    !trimmed || trimmed.toLowerCase() === DEFAULT_CREATE_GROUP_CODE.toLowerCase();
  if (nodeEnv === "production" && publicFallback) {
    throw new Error("CREATE_GROUP_CODE must be set to a private value");
  }
  return trimmed || DEFAULT_CREATE_GROUP_CODE;
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
