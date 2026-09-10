import { AppHeader } from "@/components/app-header";
import { CreateForm } from "@/components/create-form";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const account = await getAccount();
  return (
    <>
      <AppHeader
        name={account?.preferred_name ?? null}
        showSignOut={Boolean(account)}
        homeHref={account ? "/manage" : "/"}
      />
      <main className="main main--centered">
        <CreateForm signedInAs={account?.preferred_name ?? null} />
      </main>
    </>
  );
}
