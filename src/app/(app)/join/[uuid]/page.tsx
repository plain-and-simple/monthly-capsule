import { redirect } from "next/navigation";
import { JoinForm } from "@/components/join-form";
import { SiteHeader } from "@/components/site-header";
import { sessionRejoinsGroup } from "@/lib/manage";
import { getAccount, getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const [session, account] = await Promise.all([getSession(), getAccount()]);
  if (sessionRejoinsGroup(session, uuid)) {
    redirect(`/g/${uuid}`);
  }
  return (
    <>
      <SiteHeader />
      <JoinForm uuid={uuid} signedInAs={account?.preferred_name ?? null} />
    </>
  );
}
