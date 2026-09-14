import { NextResponse } from "next/server";
import { compileDueCapsules } from "@/lib/compile";
import { authorizeCron } from "@/lib/cron-auth";
import { purgeExpiredPasswordResetTokens } from "@/lib/password-reset-store";
import { purgeOldPasswordResetAttempts, purgeOldPinAttempts } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await purgeOldPinAttempts();
  await purgeOldPasswordResetAttempts();
  await purgeExpiredPasswordResetTokens();
  const results = await compileDueCapsules();
  return NextResponse.json({ ok: true, results });
}
