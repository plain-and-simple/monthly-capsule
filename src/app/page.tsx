import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { FlashToast } from "@/components/app-toast";
import { AuthPanel } from "@/components/auth-panel";
import { SampleSpread } from "@/components/sample-spread";
import { LANDING_HEADLINE, LANDING_INVITE_NOTE, LANDING_LEDE, PRIVACY_TITLE, PRODUCT_NAME, SIGNED_OUT_TOAST } from "@/lib/copy";
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
        <div className="wrap">
          <div className="stack stack--loose">
            <div className="stack">
              <h1 className="display serif">{LANDING_HEADLINE}</h1>
              <p className="lede">{LANDING_LEDE}</p>
            </div>

            <div className="panel">
              <p className="small">{LANDING_INVITE_NOTE}</p>
            </div>

            <AuthPanel next={next} error={error} returnTo="/" signInFirst />

            <SampleSpread />
          </div>
        </div>
      </main>
      <footer className="footer">
        <div className="wrap row row--between">
          <span>{PRODUCT_NAME}</span>
          <span className="tiny">
            No ads. No phone numbers. Nothing public. <Link href="/privacy">{PRIVACY_TITLE}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
