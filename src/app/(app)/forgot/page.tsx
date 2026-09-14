import { AppHeader } from "@/components/app-header";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { FORGOT_PASSWORD_HEADING, PRODUCT_NAME } from "@/lib/copy";

export const dynamic = "force-dynamic";

export const metadata = {
  title: FORGOT_PASSWORD_HEADING,
};

export default function ForgotPasswordPage() {
  return (
    <>
      <AppHeader />
      <main className="main main--centered">
        <div className="wrap wrap--narrow">
          <div className="card card--pad-lg">
            <ForgotPasswordForm />
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
