import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { JoinForm } from "@/components/join-form";
import { JoinGate } from "@/components/join-gate";
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
  if (sessionRejoinsGroup(session, uuid)) {
    redirect(`/g/${uuid}`);
  }

  const admin = createAdminClient();
  const [{ data: group }, { count }] = await Promise.all([
    admin.from("groups").select("name").eq("id", uuid).maybeSingle(),
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid),
  ]);
  const next = inviteJoinPath(uuid);

  return (
    <>
      <AppHeader
        name={account?.preferred_name ?? null}
        showSignOut={Boolean(account)}
        homeHref={account ? "/manage" : "/"}
      />
      <main className="main">
        {account ? (
          <JoinForm
            uuid={uuid}
            signedInAs={account.preferred_name}
            groupName={group?.name ?? null}
            memberCount={count ?? undefined}
            error={error}
          />
        ) : (
          <JoinGate
            next={next}
            groupName={group?.name ?? null}
            memberCount={count ?? undefined}
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
