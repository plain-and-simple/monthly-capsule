import "server-only";
import { Resend } from "resend";
import { parseEmail } from "@/lib/account";
import { closedYearMonthsFromRows, listGroupMonthRows } from "@/lib/compile";
import {
  dueCycleEmailYearMonths,
  letterPath,
  openEmailHtml,
  openEmailSubject,
  openEmailText,
  planCycleEmailMembers,
  reminderEmailHtml,
  reminderEmailSubject,
  reminderEmailText,
  submittedMemberIds,
  type CycleEmailKind,
  type CycleEmailSendRow,
  type CycleEmailSentMap,
} from "@/lib/cycle-email";
import { appUrl, resendApiKey, resendFromEmail } from "@/lib/env";
import {
  capsuleFromHeader,
  formatSkippedNoEmail,
  previewCapsuleSend,
  RESEND_SEND_TIMEOUT_MS,
  RESEND_TIMEOUT_MESSAGE,
  resendSendAccepted,
  withTimeout,
} from "@/lib/email-policy";
import { shortMonthDayYear } from "@/lib/group-status";
import { activeRosterMembers } from "@/lib/roster";
import { monthLabel } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase";
import type { Account, Group, Member, Submission } from "@/lib/types";

export type SendCycleEmailResult = {
  kind: CycleEmailKind;
  yearMonth: string;
  sent: number;
  skippedNoEmail: number;
  skippedNames: string[];
  error: string | null;
  reason:
    | "ok"
    | "dry-run"
    | "none-due"
    | "no-resend-key"
    | "bad-from"
    | "no-recipients"
    | "resend-error";
};

type RosterSeat = {
  member: Member;
  to: string | null;
};

async function loadRoster(groupId: string): Promise<RosterSeat[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .is("removed_at", null);
  const roster = activeRosterMembers((members ?? []) as Member[]);

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

  return roster.map((member) => ({
    member,
    to:
      parseEmail(member.email ?? "") ??
      parseEmail(member.account_id ? accountEmailById.get(member.account_id) ?? "" : ""),
  }));
}

async function loadSends(groupId: string, yearMonth: string): Promise<CycleEmailSendRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cycle_email_sends")
    .select("member_id, open_email_sent_at, reminder_email_sent_at")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth);
  if (error) throw new Error("Could not load cycle emails");
  return (data ?? []) as CycleEmailSendRow[];
}

export async function loadCycleEmailSentMap(groupId: string): Promise<CycleEmailSentMap> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cycle_email_sends")
    .select("year_month, open_email_sent_at, reminder_email_sent_at")
    .eq("group_id", groupId);
  if (error) throw new Error("Could not load cycle emails");
  const map: CycleEmailSentMap = {};
  for (const row of data ?? []) {
    const yearMonth = row.year_month as string;
    const current = map[yearMonth] ?? { open: false, reminder: false };
    map[yearMonth] = {
      open: current.open || Boolean(row.open_email_sent_at),
      reminder: current.reminder || Boolean(row.reminder_email_sent_at),
    };
  }
  return map;
}

async function loadSubmittedIds(groupId: string, yearMonth: string): Promise<string[]> {
  const months = await listGroupMonthRows(groupId);
  const open = months.find((month) => month.year_month === yearMonth && month.status === "open");
  if (!open) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("submissions").select("member_id, status").eq("month_id", open.id);
  return submittedMemberIds((data ?? []) as Pick<Submission, "member_id" | "status">[]);
}

async function stampCycleEmail(
  groupId: string,
  yearMonth: string,
  memberId: string,
  kind: CycleEmailKind,
  at: string,
) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("cycle_email_sends")
    .select("id, open_email_sent_at, reminder_email_sent_at")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth)
    .eq("member_id", memberId)
    .maybeSingle();

  const already =
    kind === "open"
      ? Boolean(existing?.open_email_sent_at)
      : Boolean(existing?.reminder_email_sent_at);
  if (already) return;

  if (existing) {
    const column = kind === "open" ? "open_email_sent_at" : "reminder_email_sent_at";
    await admin
      .from("cycle_email_sends")
      .update({ [column]: at })
      .eq("id", existing.id)
      .is(column, null);
    return;
  }

  const { error } = await admin.from("cycle_email_sends").insert({
    group_id: groupId,
    year_month: yearMonth,
    member_id: memberId,
    open_email_sent_at: kind === "open" ? at : null,
    reminder_email_sent_at: kind === "reminder" ? at : null,
  });
  if (!error) return;

  const { data: raced } = await admin
    .from("cycle_email_sends")
    .select("id")
    .eq("group_id", groupId)
    .eq("year_month", yearMonth)
    .eq("member_id", memberId)
    .maybeSingle();
  if (!raced) return;
  const column = kind === "open" ? "open_email_sent_at" : "reminder_email_sent_at";
  await admin.from("cycle_email_sends").update({ [column]: at }).eq("id", raced.id).is(column, null);
}

export async function sendGroupCycleEmail(
  group: Group,
  kind: CycleEmailKind,
  yearMonth: string,
  opts: { dryRun?: boolean } = {},
): Promise<SendCycleEmailResult> {
  const roster = await loadRoster(group.id);
  const sends = await loadSends(group.id, yearMonth);
  const submitted = kind === "reminder" ? await loadSubmittedIds(group.id, yearMonth) : [];
  const memberIds = new Set(
    planCycleEmailMembers({
      kind,
      members: roster.map((seat) => seat.member),
      sends,
      submittedMemberIds: submitted,
    }),
  );
  const targets = roster.filter((seat) => memberIds.has(seat.member.id));
  const withEmail = targets.filter((seat) => Boolean(seat.to));
  const skippedNames = targets
    .filter((seat) => !seat.to)
    .map((seat) => seat.member.preferred_name.trim() || "A member");
  const skippedNoEmail = skippedNames.length;

  const from = capsuleFromHeader(resendFromEmail());
  const preview = previewCapsuleSend({
    fromOk: from.ok,
    fromError: from.ok ? undefined : from.error,
    hasResendKey: Boolean(resendApiKey()),
    recipientCount: withEmail.length,
    skippedNoEmail,
  });

  if (!from.ok) {
    return {
      kind,
      yearMonth,
      sent: 0,
      skippedNoEmail,
      skippedNames,
      error: from.error,
      reason: "bad-from",
    };
  }
  if (!preview.canSend) {
    return {
      kind,
      yearMonth,
      sent: 0,
      skippedNoEmail,
      skippedNames,
      error: preview.error,
      reason: preview.reason === "ok" ? "no-recipients" : preview.reason,
    };
  }

  if (opts.dryRun) {
    const skipped = formatSkippedNoEmail({ skippedNoEmail, skippedNames });
    return {
      kind,
      yearMonth,
      sent: 0,
      skippedNoEmail,
      skippedNames,
      error: skipped,
      reason: "dry-run",
    };
  }

  const key = resendApiKey();
  if (!key) {
    return {
      kind,
      yearMonth,
      sent: 0,
      skippedNoEmail,
      skippedNames,
      error: "Email is not configured.",
      reason: "no-resend-key",
    };
  }

  const link = `${appUrl()}${letterPath(group.id)}`;
  const labeled = monthLabel(yearMonth);
  const closeLabel = shortMonthDayYear(yearMonth, group.submit_end_day);
  const subject = kind === "open" ? openEmailSubject() : reminderEmailSubject();
  const html =
    kind === "open"
      ? openEmailHtml({ groupName: group.name, monthLabel: labeled, link })
      : reminderEmailHtml({ groupName: group.name, monthLabel: labeled, link, closeLabel });
  const text =
    kind === "open"
      ? openEmailText({ groupName: group.name, monthLabel: labeled, link })
      : reminderEmailText({ groupName: group.name, monthLabel: labeled, link, closeLabel });

  const resend = new Resend(key);
  let accepted = 0;
  let error: string | null = null;

  for (const seat of withEmail) {
    const to = seat.to;
    if (!to) continue;
    try {
      const result = await withTimeout(
        resend.emails.send({
          from: from.from,
          to: [to],
          subject,
          html,
          text,
        }),
        RESEND_SEND_TIMEOUT_MS,
        RESEND_TIMEOUT_MESSAGE,
      );
      const interpreted = resendSendAccepted(result);
      if (interpreted.ok) {
        accepted += 1;
        await stampCycleEmail(group.id, yearMonth, seat.member.id, kind, new Date().toISOString());
        console.info("cycle email accepted", {
          kind,
          groupId: group.id,
          yearMonth,
          memberId: seat.member.id,
          id: interpreted.id,
        });
      } else {
        error = interpreted.message;
        console.error("cycle email resend rejected", {
          kind,
          groupId: group.id,
          yearMonth,
          memberId: seat.member.id,
          error,
        });
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Resend failed";
      console.error("cycle email resend rejected", {
        kind,
        groupId: group.id,
        yearMonth,
        memberId: seat.member.id,
        error,
      });
    }
  }

  return {
    kind,
    yearMonth,
    sent: accepted,
    skippedNoEmail,
    skippedNames,
    error,
    reason: error && accepted === 0 ? "resend-error" : "ok",
  };
}

export async function sendDueCycleEmails(now: Date = new Date(), opts: { dryRun?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("*");
  if (error) throw new Error("Could not list groups");

  const results: SendCycleEmailResult[] = [];
  for (const group of (groups ?? []) as Group[]) {
    const months = await listGroupMonthRows(group.id);
    const closed = closedYearMonthsFromRows(months);
    const openMonths = dueCycleEmailYearMonths(
      "open",
      group,
      now,
      closed,
      group.force_open_year_month,
    );
    const reminderMonths = dueCycleEmailYearMonths(
      "reminder",
      group,
      now,
      closed,
      group.force_open_year_month,
    );

    if (openMonths.length === 0 && reminderMonths.length === 0) {
      results.push({
        kind: "open",
        yearMonth: "",
        sent: 0,
        skippedNoEmail: 0,
        skippedNames: [],
        error: null,
        reason: "none-due",
      });
      continue;
    }

    for (const yearMonth of openMonths) {
      results.push(await sendGroupCycleEmail(group, "open", yearMonth, opts));
    }
    for (const yearMonth of reminderMonths) {
      results.push(await sendGroupCycleEmail(group, "reminder", yearMonth, opts));
    }
  }
  return results;
}
