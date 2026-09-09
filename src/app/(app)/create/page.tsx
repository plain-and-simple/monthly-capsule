import { CreateForm } from "@/components/create-form";
import { SiteHeader } from "@/components/site-header";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const account = await getAccount();
  return (
    <>
      <SiteHeader />
      <CreateForm signedInAs={account?.preferred_name ?? null} />
    </>
  );
}
