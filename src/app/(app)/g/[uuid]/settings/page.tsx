import Link from "next/link";
import { RegenPinForm } from "@/components/regen-pin-form";
import { SettingsForm } from "@/components/settings-form";
import { requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group } = await requireOwner(uuid);

  return (
    <div className="space-y-10">
      <Link href={`/g/${uuid}`} className="text-sm text-muted">
        Back
      </Link>
      <SettingsForm group={group} />
      <RegenPinForm groupId={group.id} />
    </div>
  );
}
