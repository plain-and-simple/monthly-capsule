import Link from "next/link";
import { CycleForm } from "@/components/cycle-form";
import { RegenPinForm } from "@/components/regen-pin-form";
import { SettingsForm } from "@/components/settings-form";
import { latestUnsentCapsule } from "@/lib/compile";
import { groupDisplayName } from "@/lib/copy";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { capsuleTitle } from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";
import { requireOwner } from "@/lib/session";
import { writtenCount, writtenCountPhrase } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group } = await requireOwner(uuid);
  const [{ open, yearMonth, version }, unsent] = await Promise.all([
    resolveSubmitWindow(group),
    latestUnsentCapsule(uuid),
  ]);
  const name = groupDisplayName(group.name);
  const admin = createAdminClient();

  let writtenPhrase: string | undefined;
  if (yearMonth && version != null) {
    const [{ data: month }, { count }] = await Promise.all([
      admin
        .from("months")
        .select("id")
        .eq("group_id", uuid)
        .eq("year_month", yearMonth)
        .eq("version", version)
        .maybeSingle(),
      admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid),
    ]);
    if (month) {
      const { data: submissions } = await admin
        .from("submissions")
        .select("status")
        .eq("month_id", month.id);
      writtenPhrase = writtenCountPhrase(
        writtenCount((submissions ?? []) as Array<{ status?: string | null }>),
        count ?? 0,
      );
    }
  }

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <Link href={`/g/${uuid}`} className="backlink">
              ← {name}
            </Link>
            <h1>Settings</h1>
            <p className="muted small">Only you can see this page.</p>
          </div>

          <CycleForm
            groupId={group.id}
            submitOpen={open}
            unsent={unsent}
            thisMonthLabel={
              yearMonth ? capsuleTitle(monthLabel(yearMonth), version ?? 1) : undefined
            }
            writtenPhrase={writtenPhrase}
          />

          <hr className="rule" />
          <SettingsForm group={group} />
          <hr className="rule" />
          <RegenPinForm groupId={group.id} />
        </div>
      </div>
    </main>
  );
}
