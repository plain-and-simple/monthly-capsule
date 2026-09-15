import { createGroupCode } from "@/lib/env";
import { STUDIO_COOKIE } from "@/lib/constants";
import { sessionCookieOptions } from "@/lib/hosting";
import { flashErrorPath } from "@/lib/session-policy";
import { seeOther } from "@/lib/session-redirect";
import { mintStudioToken } from "@/lib/studio-session";
import { rejectInvalidStudioCode } from "@/lib/studio-code";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST studio code: set the studio cookie on the response, then 303 GET /admin. */
export async function POST(request: Request) {
  const form = await request.formData();
  const codeError = rejectInvalidStudioCode(
    String(form.get("studio_code") ?? ""),
    createGroupCode(),
  );
  if (codeError) {
    return seeOther(request, flashErrorPath("/admin", codeError.error));
  }

  const response = seeOther(request, "/admin");
  response.cookies.set(
    STUDIO_COOKIE,
    await mintStudioToken(),
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );
  return response;
}
