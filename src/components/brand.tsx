import Link from "next/link";
import { CapsuleSeal } from "@/components/capsule-seal";
import { CHROME_MARK, PRODUCT_NAME } from "@/lib/copy";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label={PRODUCT_NAME}>
      <CapsuleSeal className="brand__mark" />
      <span className="brand__name">{CHROME_MARK}</span>
    </Link>
  );
}
