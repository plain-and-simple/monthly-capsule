import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ResetPasswordForm } from "@/components/reset-password-form";
import {
  PRODUCT_NAME,
  RESET_LINK_INVALID,
  RESET_PASSWORD_HEADING,
  RESET_REQUEST_NEW,
} from "@/lib/copy";
import { peekPasswordReset } from "@/lib/password-reset-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: RESET_PASSWORD_HEADING,
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const peeked = await peekPasswordReset(token);

  return (
    <>
      <AppHeader />
      <main className="main main--centered">
        <div className="wrap wrap--narrow">
          <div className="card card--pad-lg">
            {peeked.ok ? (
              <ResetPasswordForm token={token} />
            ) : (
              <div className="stack">
                <h2>{RESET_PASSWORD_HEADING}</h2>
                <p>{RESET_LINK_INVALID}</p>
                <Link className="backlink" href="/forgot">
                  ← {RESET_REQUEST_NEW}
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="footer">
        <div className="wrap wrap--wide row row--between">
          <span>{PRODUCT_NAME}</span>
        </div>
      </footer>
    </>
  );
}
