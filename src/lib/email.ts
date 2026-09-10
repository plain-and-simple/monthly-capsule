import "server-only";
import { Resend } from "resend";
import { capsuleEmailHtml, capsuleEmailSubject } from "@/lib/capsule-email";
import { appUrl, resendApiKey, resendFromEmail } from "@/lib/env";
import { cronShouldSendCapsule, sentEmailUpdate } from "@/lib/email-policy";
import { nextOpenPhrase } from "@/lib/group-status";
import { emailTargetYearMonth, monthLabel } from "@/lib/schedule";
import { includedSubmissions } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";
import type { Capsule, Group, Member, Month, Submission } from "@/lib/types";

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
    if (!cronShouldSendCapsule(capsule as Capsule)) {
      results.push({
        groupId: group.id,
        yearMonth,
        sent: 0,
        skipped: capsule.email_sent_at ? "already-sent" : "held",
      });
      continue;
    }

    const sent = await sendCapsuleEmail(group, month as Month, capsule as Capsule);
    results.push({ groupId: group.id, yearMonth, sent, skipped: sent === 0 ? "no-recipients" : "" });
  }

  return results;
}

export async function sendGroupMonthEmail(group: Group, yearMonth: string) {
  const admin = createAdminClient();
  const { data: month } = await admin
    .from("months")
    .select("*")
    .eq("group_id", group.id)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (!month) {
    return { sent: 0, skipped: "no-month" as const };
  }

  const { data: capsule } = await admin
    .from("capsules")
    .select("*")
    .eq("month_id", month.id)
    .maybeSingle();
  if (!capsule) {
    return { sent: 0, skipped: "no-capsule" as const };
  }
  if (capsule.email_sent_at) {
    return { sent: 0, skipped: "already-sent" as const };
  }

  const sent = await sendCapsuleEmail(group, month as Month, capsule as Capsule);
  return { sent, skipped: sent === 0 ? ("no-recipients" as const) : ("" as const) };
}

export async function holdGroupMonthEmail(groupId: string, yearMonth: string) {
  const admin = createAdminClient();
  const { data: month } = await admin
    .from("months")
    .select("id")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (!month) return { ok: false as const, reason: "no-month" as const };

  const { data: capsule } = await admin
    .from("capsules")
    .select("id, email_sent_at")
    .eq("month_id", month.id)
    .maybeSingle();
  if (!capsule) return { ok: false as const, reason: "no-capsule" as const };
  if (capsule.email_sent_at) return { ok: false as const, reason: "already-sent" as const };

  const { error } = await admin
    .from("capsules")
    .update({ email_held: true })
    .eq("id", capsule.id)
    .is("email_sent_at", null);
  if (error) return { ok: false as const, reason: "failed" as const };
  return { ok: true as const, reason: "" as const };
}

async function sendCapsuleEmail(group: Group, month: Month, capsule: Capsule) {
  const admin = createAdminClient();
  const { data: members } = await admin.from("members").select("*").eq("group_id", group.id);

  const roster = (members ?? []) as Member[];
  const recipients = roster.filter((member) => member.email);
  const key = resendApiKey();
  const link = `${appUrl()}/g/${group.id}/capsule/${month.year_month}`;
  const { data: submissionRows } = await admin.from("submissions").select("*").eq("month_id", month.id);
  const letters = includedSubmissions((submissionRows ?? []) as Submission[]).map((row) => {
    const author = roster.find((member) => member.id === row.member_id);
    return {
      name: author?.preferred_name || "Friend",
      body: row.body,
    };
  });
  const html = capsuleEmailHtml({
    groupName: group.name,
    monthLabel: monthLabel(month.year_month),
    link,
    letters,
    nextOpen: nextOpenPhrase(month.year_month, group.submit_start_day),
  });
  const subject = capsuleEmailSubject(group.name, monthLabel(month.year_month));

  if (!key) {
    return 0;
  }

  if (recipients.length > 0) {
    const resend = new Resend(key);
    for (const member of recipients) {
      await resend.emails.send({
        from: resendFromEmail(),
        to: member.email as string,
        subject,
        html,
      });
    }
  }

  await admin
    .from("capsules")
    .update(sentEmailUpdate(new Date().toISOString()))
    .eq("id", capsule.id)
    .is("email_sent_at", null);

  return recipients.length;
}
