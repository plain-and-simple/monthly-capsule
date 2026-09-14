"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

function PendingLinkLabel({
  children,
  pendingLabel,
  clicked,
}: {
  children: ReactNode;
  pendingLabel: string;
  clicked: boolean;
}) {
  const { pending } = useLinkStatus();
  return <>{pending || clicked ? pendingLabel : children}</>;
}

export function PendingLink({
  href,
  className,
  children,
  pendingLabel = "Working…",
  prefetch,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
  prefetch?: boolean;
}) {
  const pathname = usePathname();
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    setClicked(false);
  }, [pathname, href]);

  return (
    <Link
      href={href}
      className={className}
      prefetch={prefetch}
      aria-busy={clicked || undefined}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        setClicked(true);
      }}
    >
      <PendingLinkLabel pendingLabel={pendingLabel} clicked={clicked}>
        {children}
      </PendingLinkLabel>
    </Link>
  );
}
