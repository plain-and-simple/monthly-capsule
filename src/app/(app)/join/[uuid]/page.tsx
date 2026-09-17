import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { InvalidInvite } from "@/components/invalid-invite";
import { JoinForm } from "@/components/join-form";
import { JoinGate } from "@/components/join-gate";
import { parseGroupId } from "@/lib/group-id";
import { sessionRejoinsGroup } from "@/lib/manage";
import { inviteJoinPath } from "@/lib/return-path";
import { getAccount, getSession } from "@/lib/session";
import { parseFlashError } from "@/lib/session-policy";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { uuid } = await params;
  const error = parseFlashError((await searchParams).error);
  const [session, account] = await Promise.all([getSession(), getAccount()]);
  const groupId = parseGroupId(uuid);
  if (!groupId) {
    return (
      <>
        <AppHeader
          name={account?.preferred_name ?? null}
          showSignOut={Boolean(account)}
          homeHref={account ? "/manage" : "/"}
        />
        <main className="main">
          <InvalidInvite signedIn={Boolean(account)} />
        </main>
      </>
    );
  }
  if (sessionRejoinsGroup(session, groupId)) {
    redirect(`/g/${groupId}`);
  }

  const admin = createAdminClient();
  const [{ data: group }, { count }] = await Promise.all([
    admin.from("groups").select("name").eq("id", groupId).maybeSingle(),
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", groupId).is("removed_at", null),
  ]);
  const next = inviteJoinPath(groupId);

  return (
    <>
      <AppHeader
        name={account?.preferred_name ?? null}
        showSignOut={Boolean(account)}
        homeHref={account ? "/manage" : "/"}
      />
      <main className="main">
        {!group ? (
          <InvalidInvite signedIn={Boolean(account)} />
        ) : account ? (
          <JoinForm
            uuid={groupId}
            signedInAs={account.preferred_name}
            groupName={group.name}
            memberCount={count ?? undefined}
            invited
            error={error}
          />
        ) : (
          <JoinGate
            next={next}
            groupName={group.name}
            memberCount={count ?? undefined}
            invited
            error={error}
          />
        )}
      </main>
      <footer className="footer">
        <div className="wrap wrap--narrow center">
          <span className="tiny">
            Nothing here is public. Only people with the link and the PIN can join.
          </span>
        </div>
      </footer>
    </>
  );
}
