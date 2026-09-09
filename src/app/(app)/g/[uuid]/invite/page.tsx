import Link from "next/link";
import { InvitePanel } from "@/components/invite-panel";
import { appUrl } from "@/lib/env";
import { invitePayload } from "@/lib/manage";
import { requireGroupMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  await requireGroupMember(uuid);
  const { shareUrl } = invitePayload(appUrl(), uuid);

  return (
    <div className="space-y-6">
      <Link href={`/g/${uuid}`} className="text-sm text-muted">
        Back
      </Link>
      <InvitePanel shareUrl={shareUrl} />
    </div>
  );
}
