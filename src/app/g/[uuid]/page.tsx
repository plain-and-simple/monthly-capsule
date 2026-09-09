import Link from "next/link";
import { leaveGroup } from "@/actions/leave";
import { currentYearMonth, isSubmitOpen, monthLabel } from "@/lib/schedule";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function GroupHomePage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const { group, member } = await requireGroupMember(uuid);
  const open = isSubmitOpen(group);
  const admin = createAdminClient();

  const [{ count }, { data: compiled }] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }).eq("group_id", uuid),
    admin
      .from("months")
      .select("year_month")
      .eq("group_id", uuid)
      .eq("status", "compiled")
      .order("year_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const capsuleMonth = compiled?.year_month as string | undefined;
  const thisMonth = currentYearMonth();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{open ? "Open" : "Closed"}</p>
        <h1 className="font-serif text-4xl leading-tight">{group.name || "Capsule"}</h1>
        <p className="mt-2 text-muted">
          {count ?? 0} {count === 1 ? "member" : "members"}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {open ? (
          <Link className="btn" href={`/g/${uuid}/submit`}>
            Submit
          </Link>
        ) : (
          <span className="btn btn-ghost">Submit closed</span>
        )}
        {capsuleMonth ? (
          <Link className="btn btn-ghost" href={`/g/${uuid}/capsule/${capsuleMonth}`}>
            View capsule
            {capsuleMonth !== thisMonth ? ` · ${monthLabel(capsuleMonth)}` : ""}
          </Link>
        ) : null}
        {member.role === "owner" ? (
          <Link className="btn btn-ghost" href={`/g/${uuid}/settings`}>
            Settings
          </Link>
        ) : null}
      </div>
      <form action={leaveGroup}>
        <button type="submit" className="text-sm text-muted underline">
          Leave
        </button>
      </form>
    </div>
  );
}
