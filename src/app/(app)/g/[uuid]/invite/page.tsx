import Link from "next/link";
import { InvitePanel } from "@/components/invite-panel";
import { groupDisplayName } from "@/lib/copy";
import { appUrl } from "@/lib/env";
import { invitePayload } from "@/lib/manage";
import { requireGroupMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group } = await requireGroupMember(uuid);
  const { shareUrl } = invitePayload(appUrl(), uuid);
  const name = groupDisplayName(group.name);

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack stack--loose">
          <Link href={`/g/${uuid}`} className="backlink">
            ← {name}
          </Link>
          <InvitePanel shareUrl={shareUrl} groupName={name} />
        </div>
      </div>
    </main>
  );
}
