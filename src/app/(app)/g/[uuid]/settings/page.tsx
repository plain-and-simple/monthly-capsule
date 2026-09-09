import Link from "next/link";
import { CycleForm } from "@/components/cycle-form";
import { RegenPinForm } from "@/components/regen-pin-form";
import { SettingsForm } from "@/components/settings-form";
import { latestUnsentYearMonth } from "@/lib/compile";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group } = await requireOwner(uuid);
  const [{ open }, unsentYearMonth] = await Promise.all([
    resolveSubmitWindow(group),
    latestUnsentYearMonth(uuid),
  ]);

  return (
    <div className="space-y-10">
      <Link href={`/g/${uuid}`} className="link-quiet">
        Back
      </Link>
      <SettingsForm group={group} />
      <CycleForm groupId={group.id} submitOpen={open} unsentYearMonth={unsentYearMonth} />
      <RegenPinForm groupId={group.id} />
    </div>
  );
}
