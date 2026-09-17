import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { FlashToast } from "@/components/app-toast";
import { AuthPanel } from "@/components/auth-panel";
import { LANDING_HEADLINE, LANDING_LEDE, LANDING_MONTH_GOES, PRODUCT_NAME, SIGNED_OUT_TOAST } from "@/lib/copy";
import { parseReturnPath } from "@/lib/return-path";
import { getAccount } from "@/lib/session";
import { parseFlashError, parseFlashNotice } from "@/lib/session-policy";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; notice?: string }>;
}) {
  const account = await getAccount();
  const params = await searchParams;
  const next = parseReturnPath(params.next ?? "");
  const error = parseFlashError(params.error);
  const signedOut = parseFlashNotice(params.notice) ? SIGNED_OUT_TOAST : null;
  if (account) {
    redirect(next ?? "/manage");
  }

  return (
    <div className="page">
      {signedOut ? <FlashToast message={signedOut} /> : null}
      <AppHeader />
      <main className="main">
        <div className="wrap wrap--wide">
          <div className="stack stack--loose">
            <div className="stack">
              <h1 className="display serif">{LANDING_HEADLINE}</h1>
              <p className="lede">{LANDING_LEDE}</p>
            </div>

            <AuthPanel next={next} error={error} returnTo="/" />

            <div className="panel">
              <p className="small muted">
                Have an invite link? Open it. You will create an account or sign in, then enter the
                Group PIN.
              </p>
            </div>

            <div className="stack stack--tight">
              <p className="eyebrow">How a month goes</p>
              <p className="small">{LANDING_MONTH_GOES}</p>
            </div>
          </div>
        </div>
      </main>
      <footer className="footer">
        <div className="wrap wrap--wide row row--between">
          <span>{PRODUCT_NAME}</span>
          <span className="tiny">No ads. No phone numbers. Nothing public.</span>
        </div>
      </footer>
    </div>
  );
}
