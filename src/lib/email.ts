import "server-only";
import { Resend } from "resend";
import { capsuleEmailHtml, capsuleEmailSubject } from "@/lib/capsule-email";
import { parseCapsuleArchive } from "@/lib/capsule-archive";
import { appUrl, resendApiKey, resendFromEmail } from "@/lib/env";
import {
  capsuleFromHeader,
  cronShouldSendCapsule,
  formatCapsuleSendResult,
  resendSendAccepted,
  sentEmailUpdate,
  shouldMarkCapsuleEmailed,
} from "@/lib/email-policy";
import { nextOpenPhrase } from "@/lib/group-status";
import { resolveCapsuleRecipients } from "@/lib/recipients";
import { findGroupCapsule } from "@/lib/compile";
import { capsuleHref, capsuleTitle, normalizeMonthVersion } from "@/lib/month-version";
import { emailTargetYearMonth, monthLabel } from "@/lib/schedule";
import { includedSubmissions } from "@/lib/submit";
import { createAdminClient } from "@/lib/supabase";
import type { Account, Capsule, Group, Member, Month, Submission } from "@/lib/types";

export type SendGroupMonthResult = {
  sent: number;
  skippedNoEmail: number;
  markedSent: boolean;
  error: string | null;
  reason:
    | "ok"
    | "no-month"
    | "no-capsule"
    | "already-sent"
    | "held"
    | "no-resend-key"
    | "bad-from"
    | "no-recipients"
    | "resend-error";
  message: string;
};

function sendResult(
  partial: Omit<SendGroupMonthResult, "message">,
): SendGroupMonthResult {
  return { ...partial, message: formatCapsuleSendResult(partial) };
}

function resolveOwnerReplyTo(
  roster: Member[],
  accountEmailById: Map<string, string>,
): string | null {
  const owner = roster.find((member) => member.role === "owner");
  if (!owner) return null;
  if (owner.email?.trim()) return owner.email.trim().toLowerCase();
  if (owner.account_id) {
    return accountEmailById.get(owner.account_id) ?? null;
  }
  return null;
}

export async function sendDueCapsuleEmails(now: Date = new Date()) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");

  const results: {
    groupId: string;
    yearMonth: string;
    sent: number;
    skipped: string;
    error: string | null;
  }[] = [];

  for (const group of (groups ?? []) as Group[]) {
    const yearMonth = emailTargetYearMonth(group, now);
    const result = await sendGroupMonthEmail(group, yearMonth, { cron: true });
    results.push({
      groupId: group.id,
      yearMonth,
      sent: result.sent,
      skipped: result.reason === "ok" ? "" : result.reason,
      error: result.error,
    });
  }

  return results;
}

export async function sendGroupMonthEmail(
  group: Group,
  yearMonth: string,
  opts: { cron?: boolean; version?: number } = {},
) {
  const { month, capsule } = await findGroupCapsule(group.id, yearMonth, opts.version);
  if (!month) {
    return sendResult({
      sent: 0,
      skippedNoEmail: 0,
      markedSent: false,
      error: null,
      reason: "no-month",
    });
  }

  if (!capsule) {
    return sendResult({
      sent: 0,
      skippedNoEmail: 0,
      markedSent: false,
      error: null,
      reason: "no-capsule",
    });
  }
  if (opts.cron && !cronShouldSendCapsule(capsule as Capsule)) {
    return sendResult({
      sent: 0,
      skippedNoEmail: 0,
      markedSent: false,
      error: null,
      reason: capsule.email_sent_at ? "already-sent" : "held",
    });
  }
  if (capsule.email_sent_at) {
    return sendResult({
      sent: 0,
      skippedNoEmail: 0,
      markedSent: false,
      error: null,
      reason: "already-sent",
    });
  }

  return sendCapsuleEmail(group, month as Month, capsule as Capsule);
}

export async function holdGroupMonthEmail(groupId: string, yearMonth: string, version?: number) {
  const { month, capsule } = await findGroupCapsule(groupId, yearMonth, version);
  if (!month) return { ok: false as const, reason: "no-month" as const };
  if (!capsule) return { ok: false as const, reason: "no-capsule" as const };
  if (capsule.email_sent_at) return { ok: false as const, reason: "already-sent" as const };

  const admin = createAdminClient();
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

  const accountIds = [
    ...new Set(roster.map((member) => member.account_id).filter((id): id is string => Boolean(id))),
  ];
  const accountEmailById = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accounts } = await admin.from("accounts").select("id, email").in("id", accountIds);
    for (const account of (accounts ?? []) as Pick<Account, "id" | "email">[]) {
      accountEmailById.set(account.id, account.email);
    }
  }

  const resolved = resolveCapsuleRecipients(
    roster.map((member) => ({
      memberEmail: member.email,
      accountEmail: member.account_id ? accountEmailById.get(member.account_id) ?? null : null,
    })),
  );

  const from = capsuleFromHeader(group.name, resendFromEmail());
  if (!from.ok) {
    return sendResult({
      sent: 0,
      skippedNoEmail: resolved.skippedNoEmail,
      markedSent: false,
      error: from.error,
      reason: "bad-from",
    });
  }

  const edition = normalizeMonthVersion(month.version);
  const labeled = capsuleTitle(monthLabel(month.year_month), edition);
  const link = `${appUrl()}${capsuleHref(group.id, month.year_month, edition)}`;
  const archive = parseCapsuleArchive(capsule.archive);
  let letters = archive
    ? archive.letters.map((letter) => ({ name: letter.preferred_name, body: letter.body }))
    : null;
  if (!letters) {
    const { data: submissionRows } = await admin.from("submissions").select("*").eq("month_id", month.id);
    letters = includedSubmissions((submissionRows ?? []) as Submission[]).map((row) => {
      const author = roster.find((member) => member.id === row.member_id);
      return {
        name: author?.preferred_name || "Friend",
        body: row.body,
      };
    });
  }
  const html = capsuleEmailHtml({
    groupName: group.name,
    monthLabel: labeled,
    link,
    letters,
    nextOpen: nextOpenPhrase(month.year_month, group.submit_start_day),
  });
  const subject = capsuleEmailSubject(group.name, labeled);

  const key = resendApiKey();
  if (!key) {
    return sendResult({
      sent: 0,
      skippedNoEmail: resolved.skippedNoEmail,
      markedSent: false,
      error: "Email is not configured.",
      reason: "no-resend-key",
    });
  }

  if (resolved.emails.length === 0) {
    return sendResult({
      sent: 0,
      skippedNoEmail: resolved.skippedNoEmail,
      markedSent: false,
      error: null,
      reason: "no-recipients",
    });
  }

  const resend = new Resend(key);
  let accepted = 0;
  let error: string | null = null;
  const replyTo = resolveOwnerReplyTo(roster, accountEmailById);
  for (const to of resolved.emails) {
    try {
      const result = await resend.emails.send({
        from: from.from,
        to,
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      const interpreted = resendSendAccepted(result);
      if (interpreted.ok) {
        accepted += 1;
      } else {
        error = interpreted.message;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Resend failed";
    }
  }

  if (error) {
    console.error("capsule email resend rejected", error);
  }

  const markedSent = shouldMarkCapsuleEmailed({
    attempted: resolved.emails.length,
    accepted,
  });
  if (markedSent) {
    await admin
      .from("capsules")
      .update(sentEmailUpdate(new Date().toISOString()))
      .eq("id", capsule.id)
      .is("email_sent_at", null);
  }

  return sendResult({
    sent: accepted,
    skippedNoEmail: resolved.skippedNoEmail,
    markedSent,
    error,
    reason: error && accepted === 0 ? "resend-error" : "ok",
  });
}
