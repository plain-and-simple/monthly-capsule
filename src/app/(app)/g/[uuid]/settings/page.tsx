import Link from "next/link";
import { RegenPinForm } from "@/components/regen-pin-form";
import { SettingsForm } from "@/components/settings-form";
import { SlackAwardsForm } from "@/components/slack-awards-form";
import { closedYearMonthsFromRows, listGroupMonthRows } from "@/lib/compile";
import { groupDisplayName } from "@/lib/copy";
import { forceCloseYearMonth } from "@/lib/cycle";
import { loadCycleEmailSentMap } from "@/lib/cycle-mail";
import { appUrl } from "@/lib/env";
import { invitePayload } from "@/lib/manage";
import { capsuleMonthLabel } from "@/lib/schedule";
import { emptySlackAwards } from "@/lib/slack-awards";
import { readSlackAwardsRow } from "@/lib/slack-awards-store";
import { requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const { group } = await requireOwner(uuid);
  const name = groupDisplayName(group.name);
  const months = await listGroupMonthRows(group.id);
  const closedYearMonths = closedYearMonthsFromRows(months);
  const cycleEmailSent = await loadCycleEmailSentMap(group.id);
  const draftCycle = forceCloseYearMonth(group, closedYearMonths);
  let awards = emptySlackAwards();
  let ownerEdited = false;
  let hidden = false;
  try {
    const row = await readSlackAwardsRow(group.id, draftCycle);
    if (row) {
      awards = row.data;
      ownerEdited = row.owner_edited;
      hidden = row.hidden;
    }
  } catch {
    awards = emptySlackAwards();
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

          <SettingsForm
            group={group}
            closedYearMonths={closedYearMonths}
            cycleEmailSent={cycleEmailSent}
          />
          <hr className="rule" />
          <SlackAwardsForm
            key={`${draftCycle}:${group.slack_awards_enabled === true}:${ownerEdited}:${hidden}:${JSON.stringify(awards)}`}
            groupId={group.id}
            yearMonth={draftCycle}
            monthLabel={capsuleMonthLabel(draftCycle)}
            enabled={group.slack_awards_enabled === true}
            ownerEdited={ownerEdited}
            hidden={hidden}
            awards={awards}
          />
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
