import Link from "next/link";
import { RegenPinForm } from "@/components/regen-pin-form";
import { SettingsForm } from "@/components/settings-form";
import { groupDisplayName } from "@/lib/copy";
import { appUrl } from "@/lib/env";
import { invitePayload } from "@/lib/manage";
import { requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group } = await requireOwner(uuid);
  const name = groupDisplayName(group.name);

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

          <SettingsForm group={group} />
          <hr className="rule" />
          <RegenPinForm
            groupId={group.id}
            shareUrl={invitePayload(appUrl(), uuid).shareUrl}
            groupName={name}
          />
        </div>
      </div>
    </main>
  );
}
