import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { sendDueCapsuleEmails } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const results = await sendDueCapsuleEmails(new Date(), { dryRun });
  return NextResponse.json({ ok: true, dryRun, results });
}
