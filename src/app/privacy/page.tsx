import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  PRIVACY_BAN,
  PRIVACY_LEAVE,
  PRIVACY_PHOTOS,
  PRIVACY_READ,
  PRIVACY_TITLE,
  PRODUCT_NAME,
} from "@/lib/copy";

export const metadata: Metadata = { title: PRIVACY_TITLE };

export default function PrivacyPage() {
  return (
    <div className="page">
      <AppHeader />
      <main className="main">
        <div className="wrap">
          <div className="stack">
            <Link className="backlink" href="/">
              ← Home
            </Link>
            <h1 className="serif">{PRIVACY_TITLE}</h1>
            <p>{PRIVACY_READ}</p>
            <p>{PRIVACY_PHOTOS}</p>
            <p>{PRIVACY_LEAVE}</p>
            <p>{PRIVACY_BAN}</p>
          </div>
        </div>
      </main>
      <footer className="footer">
        <div className="wrap">
          <span className="tiny">{PRODUCT_NAME}</span>
        </div>
      </footer>
    </div>
  );
}
