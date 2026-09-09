import { JoinForm } from "@/components/join-form";
import { SiteHeader } from "@/components/site-header";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function JoinHomePage() {
  const account = await getAccount();
  return (
    <>
      <SiteHeader />
      <JoinForm signedInAs={account?.preferred_name ?? null} />
    </>
  );
}
