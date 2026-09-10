import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      <span className="brand__mark" aria-hidden="true" />
      <span className="brand__name">
        <b>Plain and Simple</b> <span>Monthly Capsule</span>
      </span>
    </Link>
  );
}
