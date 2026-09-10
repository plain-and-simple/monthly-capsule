import { AppHeader } from "@/components/app-header";
import { JoinForm } from "@/components/join-form";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function JoinHomePage() {
  const account = await getAccount();
  return (
    <>
      <AppHeader
        name={account?.preferred_name ?? null}
        showSignOut={Boolean(account)}
        homeHref={account ? "/manage" : "/"}
      />
      <main className="main">
        <JoinForm signedInAs={account?.preferred_name ?? null} />
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
