import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function NotFound() {
  return (
    <div className="page">
      <AppHeader />
      <main className="main">
        <div className="wrap">
          <div className="stack">
            <h1>Not found</h1>
            <Link href="/" className="backlink">
              ← Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
