import { AuthPanel } from "@/components/auth-panel";
import { JOIN_AUTH_HINT, JOIN_EXISTING_CTA, groupDisplayName } from "@/lib/copy";

export function JoinGate({
  next,
  groupName,
  memberCount,
}: {
  next: string;
  groupName?: string | null;
  memberCount?: number;
}) {
  const invited = Boolean(groupName);
  const title = groupName ? `Join ${groupDisplayName(groupName)}` : JOIN_EXISTING_CTA;

  return (
    <div className="wrap wrap--narrow">
      <div className="stack stack--loose">
        <div className="stack stack--tight">
          <p className="eyebrow">{invited ? "You have been invited" : "Join"}</p>
          <h1>{title}</h1>
          <p className="lede">
            {memberCount
              ? `${memberCount} ${memberCount === 1 ? "person" : "people"} so far. One letter each, once a month.`
              : "One letter each, once a month."}
          </p>
          <p className="muted small">{JOIN_AUTH_HINT}</p>
        </div>
        <div className="card card--pad-lg">
          <AuthPanel next={next} defaultMode="signup" />
        </div>
      </div>
    </div>
  );
}
