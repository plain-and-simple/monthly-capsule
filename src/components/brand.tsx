import Link from "next/link";
import { PsMark } from "@/components/ps-mark";
import { PRODUCT_NAME } from "@/lib/copy";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label={PRODUCT_NAME}>
      <PsMark className="brand__mark" />
    </Link>
  );
}
