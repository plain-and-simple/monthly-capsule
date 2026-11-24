import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { sendDueCycleEmails } from "@/lib/cycle-mail";
import { sendDueCapsuleEmails } from "@/lib/email";
import { afterPrimaryWork } from "@/lib/slack-awards";
import { refreshDueSlackAwards } from "@/lib/slack-awards-job";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const now = new Date();
  const { cycle, results } = await afterPrimaryWork(
    async () => {
      const cycle = await sendDueCycleEmails(now, { dryRun });
      const results = await sendDueCapsuleEmails(now, { dryRun });
      return { cycle, results };
    },
    async () => {
      if (dryRun) return;
      await refreshDueSlackAwards(now);
    },
  );
  return NextResponse.json({ ok: true, dryRun, results, cycle });
}
