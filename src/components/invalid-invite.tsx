import Link from "next/link";
import {
  INVALID_INVITE_FALLBACK,
  INVALID_INVITE_HEADING,
  INVALID_INVITE_HINT,
  JOIN_BACK_HOME,
  JOIN_BACK_MANAGE,
} from "@/lib/copy";

export function InvalidInvite({ signedIn }: { signedIn: boolean }) {
  const backHref = signedIn ? "/manage" : "/";
  const backLabel = signedIn ? JOIN_BACK_MANAGE : JOIN_BACK_HOME;

  return (
    <div className="wrap wrap--narrow">
      <div className="stack stack--loose">
        <Link className="backlink" href={backHref}>
          {backLabel}
        </Link>
        <div className="stack stack--tight">
          <h1>{INVALID_INVITE_HEADING}</h1>
          <p className="lede">{INVALID_INVITE_HINT}</p>
        </div>
        <Link className="btn btn--secondary" href="/join">
          {INVALID_INVITE_FALLBACK}
        </Link>
      </div>
    </div>
  );
}
