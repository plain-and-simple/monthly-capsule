import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { dispatchSlackAwardsCron } from "@/lib/slack-awards";
import { refreshMonthlySlackAwards } from "@/lib/slack-awards-job";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const outcome = await dispatchSlackAwardsCron({
    yearMonth: url.searchParams.get("year_month"),
    groupId: url.searchParams.get("group_id"),
    now: new Date(),
    run: (target) =>
      refreshMonthlySlackAwards(target.now, {
        yearMonth: target.yearMonth,
        groupId: target.groupId,
      }),
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
