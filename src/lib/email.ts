import "server-only";
import { Resend } from "resend";
import { appUrl, resendApiKey, resendFromEmail } from "@/lib/env";
import { emailTargetYearMonth } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase";
import type { Capsule, Group, Member, Month } from "@/lib/types";

export async function sendDueCapsuleEmails(now: Date = new Date()) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");

  const results: { groupId: string; yearMonth: string; sent: number; skipped: string }[] = [];

  for (const group of (groups ?? []) as Group[]) {
    const yearMonth = emailTargetYearMonth(group, now);
    const { data: month } = await admin
      .from("months")
      .select("*")
      .eq("group_id", group.id)
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (!month) {
      results.push({ groupId: group.id, yearMonth, sent: 0, skipped: "no-month" });
      continue;
    }

    const { data: capsule } = await admin
      .from("capsules")
      .select("*")
      .eq("month_id", month.id)
      .maybeSingle();

    if (!capsule) {
      results.push({ groupId: group.id, yearMonth, sent: 0, skipped: "no-capsule" });
      continue;
    }
    if (capsule.email_sent_at) {
      results.push({ groupId: group.id, yearMonth, sent: 0, skipped: "already-sent" });
      continue;
    }

    const sent = await sendCapsuleEmail(group, month as Month, capsule as Capsule);
    results.push({ groupId: group.id, yearMonth, sent, skipped: sent === 0 ? "no-recipients" : "" });
  }

  return results;
}

async function sendCapsuleEmail(group: Group, month: Month, capsule: Capsule) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("members")
    .select("*")
    .eq("group_id", group.id)
    .not("email", "is", null);

  const recipients = ((members ?? []) as Member[]).filter((member) => member.email);
  const key = resendApiKey();
  const link = `${appUrl()}/g/${group.id}/capsule/${month.year_month}`;

  if (!key) {
    return 0;
  }

  if (recipients.length > 0) {
    const resend = new Resend(key);
    for (const member of recipients) {
      await resend.emails.send({
        from: resendFromEmail(),
        to: member.email as string,
        subject: "Your monthly capsule is ready",
        html: `<p>The capsule is ready.</p><p><a href="${link}">Read it</a></p>`,
      });
    }
  }

  await admin
    .from("capsules")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", capsule.id)
    .is("email_sent_at", null);

  return recipients.length;
}
