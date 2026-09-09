import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/copy";

export function SiteHeader({
  href = "/",
  title = PRODUCT_NAME,
}: {
  href?: string;
  title?: string;
}) {
  return (
    <header className="mb-10">
      <Link href={href} className="brand-mark">
        {title}
      </Link>
    </header>
  );
}
