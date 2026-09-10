import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ManageForm } from "@/components/manage-form";
import { LANDING_CREATE_CTA, LANDING_LEDE, PRODUCT_NAME } from "@/lib/copy";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const account = await getAccount();
  if (account) {
    redirect("/manage");
  }

  return (
    <div className="page">
      <AppHeader />
      <main className="main">
        <div className="wrap">
          <div className="stack stack--loose">
            <div className="stack">
              <p className="eyebrow">Once a month</p>
              <h1 className="display serif">
                Friends write once a month.
                <br />
                You get one capsule.
              </h1>
              <p className="lede">{LANDING_LEDE}</p>
            </div>

            <div className="card card--pad-lg">
              <ManageForm />
            </div>

            <div className="ornament">
              <span className="small muted">or</span>
            </div>

            <div className="stack stack--tight">
              <Link className="btn btn--secondary btn--block" href="/create">
                {LANDING_CREATE_CTA}
              </Link>
              <p className="btn-note">Needs a studio code. Ask whoever sent you here.</p>
            </div>

            <div className="panel">
              <p className="small muted">
                Have an invite link? Open it and you will land straight on Join — you will need the
                Group PIN from whoever invited you.
              </p>
            </div>

            <div className="stack stack--tight">
              <p className="eyebrow">How a month goes</p>
              <ol className="list small" style={{ borderTop: 0 }}>
                <li style={{ borderBottom: 0, padding: "0.35rem 0" }}>
                  The window opens. Everyone writes.
                </li>
                <li style={{ borderBottom: 0, padding: "0.35rem 0" }}>
                  Write a letter, add a few photos, submit — or save a draft first.
                </li>
                <li style={{ borderBottom: 0, padding: "0.35rem 0" }}>
                  The window closes and one capsule goes out.
                </li>
              </ol>
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
