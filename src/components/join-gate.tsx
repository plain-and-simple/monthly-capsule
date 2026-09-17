import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import {
  JOIN_AUTH_HINT,
  JOIN_BACK_HOME,
  JOIN_EXISTING_CTA,
  JOIN_GENERIC_EYEBROW,
  JOIN_INVITED_EYEBROW,
  groupDisplayName,
} from "@/lib/copy";

export function JoinGate({
  next,
  groupName,
  memberCount,
  invited = false,
  error,
}: {
  next: string;
  groupName?: string | null;
  memberCount?: number;
  invited?: boolean;
  error?: string | null;
}) {
  const title = groupName ? `Join ${groupDisplayName(groupName)}` : JOIN_EXISTING_CTA;

  return (
    <div className="wrap wrap--wide">
      <div className="stack stack--loose">
        <div className="stack stack--tight">
          <Link className="backlink" href="/">
            {JOIN_BACK_HOME}
          </Link>
          <p className="eyebrow">{invited ? JOIN_INVITED_EYEBROW : JOIN_GENERIC_EYEBROW}</p>
          <h1>{title}</h1>
          <p className="lede">
            {memberCount
              ? `${memberCount} ${memberCount === 1 ? "person" : "people"} so far. One letter each, once a month.`
              : "One letter each, once a month."}
          </p>
          <p className="muted small">{JOIN_AUTH_HINT}</p>
        </div>
        <AuthPanel next={next} returnTo={next} error={error} />
      </div>
    </div>
  );
}
