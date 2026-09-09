import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <SiteHeader />
      <div className="space-y-3">
        <h1 className="font-serif text-4xl font-medium">Not found</h1>
        <Link href="/" className="link-quiet">
          Home
        </Link>
      </div>
    </div>
  );
}
