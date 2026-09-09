import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ManageForm } from "@/components/manage-form";
import {
  LANDING_CREATE_LABEL,
  LANDING_PROMISE,
  PRODUCT_NAME,
} from "@/lib/copy";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const account = await getAccount();
  if (account) {
    redirect("/manage");
  }

  return (
    <div className="landing">
      <div className="landing-photo">
        <Image
          src="/landing.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 800px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="landing-panel">
        <header className="landing-bar">
          <Link href="/" className="brand-mark">
            {PRODUCT_NAME}
          </Link>
          <Link href="/create" className="btn btn-quiet">
            {LANDING_CREATE_LABEL}
          </Link>
        </header>
        <p className="landing-promise">{LANDING_PROMISE}</p>
        <div className="landing-form">
          <ManageForm />
        </div>
      </div>
    </div>
  );
}
