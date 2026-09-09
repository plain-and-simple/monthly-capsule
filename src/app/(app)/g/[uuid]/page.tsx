import Link from "next/link";
import { leaveGroup } from "@/actions/leave";
import { GroupChrome } from "@/components/group-chrome";
import { SaveLoginForm } from "@/components/save-login-form";
import { GROUP_PRIMARY_SUBMIT, GROUP_PRIMARY_VIEW } from "@/lib/copy";
import { resolveSubmitWindow } from "@/lib/cycle-store";
import { currentYearMonth, monthLabel } from "@/lib/schedule";
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
  const { open } = await resolveSubmitWindow(group);
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
        <h1 className="font-serif text-4xl font-medium leading-tight">{open ? "Open" : "Closed"}</h1>
        <p className="mt-2 text-muted">
          {count ?? 0} {count === 1 ? "member" : "members"}
        </p>
      </div>
      {open ? (
        <Link className="btn" href={`/g/${uuid}/submit`}>
          {GROUP_PRIMARY_SUBMIT}
        </Link>
      ) : capsuleMonth ? (
        <Link className="btn" href={`/g/${uuid}/capsule/${capsuleMonth}`}>
          {GROUP_PRIMARY_VIEW}
          {capsuleMonth !== thisMonth ? ` · ${monthLabel(capsuleMonth)}` : ""}
        </Link>
      ) : null}
      <GroupChrome uuid={uuid} role={member.role} />
      {member.account_id ? (
        <Link href="/manage" className="link-quiet">
          Your capsules
        </Link>
      ) : (
        <SaveLoginForm groupId={uuid} />
      )}
      <form action={leaveGroup}>
        <button type="submit" className="link-quiet">
          Leave
        </button>
      </form>
    </div>
  );
}
