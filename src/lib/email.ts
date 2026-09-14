import "server-only";
import { Resend } from "resend";
import { capsuleEmailHtml, capsuleEmailSubject, capsuleEmailText } from "@/lib/capsule-email";
import { parseCapsuleArchive } from "@/lib/capsule-archive";
import { appUrl, resendApiKey, resendFromEmail } from "@/lib/env";
import {
  capsuleFromHeader,
  cronEmailDueCapsules,
  cronShouldSendCapsule,
  formatCapsuleSendResult,
  previewCapsuleSend,
  resendSendAccepted,
  sentEmailUpdate,
  shouldMarkCapsuleEmailed,
} from "@/lib/email-policy";
import { nextOpenPhrase } from "@/lib/group-status";
import { resolveCapsuleRecipients } from "@/lib/recipients";
import { findGroupCapsule, listGroupMonthRows } from "@/lib/compile";
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
    | "resend-error"
    | "dry-run";
  message: string;
};

function sendResult(
  partial: Omit<SendGroupMonthResult, "message"> & { message?: string },
): SendGroupMonthResult {
  return { ...partial, message: partial.message ?? formatCapsuleSendResult(partial) };
}

export async function sendDueCapsuleEmails(
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {},
) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");

  const results: {
    groupId: string;
    yearMonth: string;
    version?: number;
    sent: number;
    skipped: string;
    error: string | null;
  }[] = [];

  for (const group of (groups ?? []) as Group[]) {
    const dueYearMonth = emailTargetYearMonth(group, now);
    const months = await listGroupMonthRows(group.id);
    const compiled = months.filter((month) => month.status === "compiled");
    if (compiled.length === 0) {
      results.push({
        groupId: group.id,
        yearMonth: dueYearMonth,
        sent: 0,
        skipped: "no-capsule",
        error: null,
      });
      continue;
    }

    const candidates = (
      await Promise.all(
        compiled.map(async (month) => {
          const { capsule } = await findGroupCapsule(group.id, month.year_month, month.version);
          if (!capsule) return null;
          return {
            yearMonth: month.year_month,
            version: month.version,
            email_sent_at: (capsule.email_sent_at as string | null) ?? null,
            email_held: Boolean(capsule.email_held),
          };
        }),
      )
    ).filter((row): row is NonNullable<typeof row> => row != null);
    const due = cronEmailDueCapsules(dueYearMonth, candidates);

    if (due.length === 0) {
      results.push({
        groupId: group.id,
        yearMonth: dueYearMonth,
        sent: 0,
        skipped: "none-due",
        error: null,
      });
      continue;
    }

    for (const target of due) {
      const result = await sendGroupMonthEmail(group, target.yearMonth, {
        cron: true,
        version: target.version,
        dryRun: opts.dryRun,
      });
      results.push({
        groupId: group.id,
        yearMonth: target.yearMonth,
        version: target.version,
        sent: result.sent,
        skipped: result.reason === "ok" ? "" : result.reason,
        error: result.error,
      });
    }
  }

  return results;
}

export async function sendGroupMonthEmail(
  group: Group,
  yearMonth: string,
  opts: { cron?: boolean; version?: number; dryRun?: boolean } = {},
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

  return sendCapsuleEmail(group, month as Month, capsule as Capsule, { dryRun: opts.dryRun });
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

async function sendCapsuleEmail(
  group: Group,
  month: Month,
  capsule: Capsule,
  opts: { dryRun?: boolean } = {},
) {
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

  const from = capsuleFromHeader(resendFromEmail());
  const preview = previewCapsuleSend({
    fromOk: from.ok,
    fromError: from.ok ? undefined : from.error,
    hasResendKey: Boolean(resendApiKey()),
    recipientCount: resolved.emails.length,
    skippedNoEmail: resolved.skippedNoEmail,
  });

  if (!from.ok || !preview.canSend) {
    return sendResult({
      sent: 0,
      skippedNoEmail: preview.skippedNoEmail,
      markedSent: false,
      error: preview.error,
      reason: preview.reason,
    });
  }

  if (opts.dryRun) {
    return sendResult({
      sent: 0,
      skippedNoEmail: preview.skippedNoEmail,
      markedSent: false,
      error: null,
      reason: "dry-run",
      message: `Dry run: would send ${preview.wouldSend}. Skipped ${preview.skippedNoEmail} with no email.`,
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
  const text = capsuleEmailText({
    groupName: group.name,
    monthLabel: labeled,
    link,
  });
  const subject = capsuleEmailSubject();

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

  const resend = new Resend(key);
  let accepted = 0;
  let error: string | null = null;
  for (const to of resolved.emails) {
    try {
      // Inbox avatar is not set here: Resend's send API has no sender-avatar
      // field (BIMI / Gravatar / provider profile only). From display is Capsule.
      const result = await resend.emails.send({
        from: from.from,
        to: [to],
        subject,
        html,
        text,
      });
      const interpreted = resendSendAccepted(result);
      if (interpreted.ok) {
        accepted += 1;
        console.info("capsule email accepted", { capsuleId: capsule.id, to, id: interpreted.id });
      } else {
        error = interpreted.message;
        console.error("capsule email resend rejected", { capsuleId: capsule.id, to, error });
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Resend failed";
      console.error("capsule email resend rejected", { capsuleId: capsule.id, to, error });
    }
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
  } else {
    console.error("capsule email not stamped", {
      capsuleId: capsule.id,
      attempted: resolved.emails.length,
      accepted,
      error,
    });
  }

  return sendResult({
    sent: accepted,
    skippedNoEmail: resolved.skippedNoEmail,
    markedSent,
    error,
    reason: error && accepted === 0 ? "resend-error" : "ok",
  });
}
