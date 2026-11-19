import "server-only";
import { STUDIO_RATE_LIMITED } from "@/lib/copy";
import { createGroupCode } from "@/lib/env";
import { clientIp, recordStudioAttempt, studioAttemptsBlocked } from "@/lib/rate-limit";
import { rejectInvalidStudioCode, STUDIO_CODE_ERROR } from "@/lib/studio-code";

/** Wrong code, a public fallback in production, and too many tries all stop here. */
export async function rejectStudioAttempt(
  input: string,
): Promise<{ ok: false; error: string } | null> {
  const ip = await clientIp();
  if (await studioAttemptsBlocked(ip)) {
    return { ok: false, error: STUDIO_RATE_LIMITED };
  }

  let expected: string;
  try {
    expected = createGroupCode();
  } catch {
    return { ok: false, error: STUDIO_CODE_ERROR };
  }

  const rejection = rejectInvalidStudioCode(input, expected);
  if (rejection) {
    await recordStudioAttempt(ip);
    return rejection;
  }
  return null;
}
