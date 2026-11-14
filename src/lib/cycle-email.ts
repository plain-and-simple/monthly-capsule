import {
  CYCLE_REMINDER_LEAD_DAYS,
  DEFAULT_EMAIL_DAY,
  DEFAULT_SUBMIT_END_DAY,
  DEFAULT_SUBMIT_START_DAY,
} from "@/lib/constants";
import {
  CYCLE_EMAIL_BUTTON,
  OPEN_EMAIL_SUBJECT,
  REMINDER_EMAIL_SUBJECT,
  groupDisplayName,
} from "@/lib/copy";
import { forceOpenStillActive, openSubmitYearMonth, type CycleGroup } from "@/lib/cycle";
import { isSubmittedThisPeriod } from "@/lib/roster";
import {
  chicagoDate,
  compareChicagoDate,
  cycleCloseChicagoDate,
  cycleOpenChicagoDate,
  nextYearMonth,
  previousYearMonth,
  yearMonthString,
  type ChicagoDate,
  type ScheduleDays,
} from "@/lib/schedule";

export type CycleEmailKind = "open" | "reminder";

export type CycleEmailSentFlags = {
  open: boolean;
  reminder: boolean;
};

export type CycleEmailSentMap = Record<string, CycleEmailSentFlags>;

export type CycleEmailSendRow = {
  member_id: string;
  open_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
};

export const SEND_OPEN_EMAIL_FIELD = "send_open_email";
export const SEND_REMINDER_EMAIL_FIELD = "send_reminder_email";
export const SEND_CYCLE_EMAIL_VALUE = "1";

export function letterPath(groupId: string): string {
  return `/g/${groupId}/submit`;
}

export function addCalendarDays(date: ChicagoDate, days: number): ChicagoDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function sameChicagoDay(a: ChicagoDate, b: ChicagoDate): boolean {
  return compareChicagoDate(a, b) === 0;
}

export function cycleReminderChicagoDate(
  cycleYearMonth: string,
  endDay: number = DEFAULT_SUBMIT_END_DAY,
): ChicagoDate {
  return addCalendarDays(cycleCloseChicagoDate(cycleYearMonth, endDay), -CYCLE_REMINDER_LEAD_DAYS);
}

export function nearbyCycleYearMonths(today: ChicagoDate): string[] {
  return [previousYearMonth(today), yearMonthString(today), nextYearMonth(today)];
}

export function cycleMonthBlocksEmail(
  yearMonth: string,
  closedYearMonths: readonly string[],
  forceOpenYearMonth: string | null,
  now: Date = new Date(),
): boolean {
  if (forceOpenYearMonth === yearMonth && forceOpenStillActive(forceOpenYearMonth, undefined, now)) {
    return false;
  }
  return closedYearMonths.includes(yearMonth);
}

export function cycleEmailDueDate(
  kind: CycleEmailKind,
  cycleYearMonth: string,
  schedule: ScheduleDays,
): ChicagoDate {
  if (kind === "open") {
    return cycleOpenChicagoDate(cycleYearMonth, schedule.submit_start_day);
  }
  return cycleReminderChicagoDate(cycleYearMonth, schedule.submit_end_day);
}

/**
 * Calendar send days for the current Chicago date.
 * Open uses submit_start_day (days 20–31 fall in M−1, clamped).
 * Reminder is CYCLE_REMINDER_LEAD_DAYS before submit_end_day in M.
 * Compiled/closed months are skipped unless force-open is still active.
 */
export function dueCycleEmailYearMonths(
  kind: CycleEmailKind,
  schedule: ScheduleDays,
  now: Date,
  closedYearMonths: readonly string[] = [],
  forceOpenYearMonth: string | null = null,
): string[] {
  const today = chicagoDate(now);
  const due: string[] = [];
  for (const yearMonth of nearbyCycleYearMonths(today)) {
    if (cycleMonthBlocksEmail(yearMonth, closedYearMonths, forceOpenYearMonth, now)) {
      continue;
    }
    if (sameChicagoDay(cycleEmailDueDate(kind, yearMonth, schedule), today)) {
      due.push(yearMonth);
    }
  }
  return due;
}

export function defaultScheduleDays(): ScheduleDays {
  return {
    submit_start_day: DEFAULT_SUBMIT_START_DAY,
    submit_end_day: DEFAULT_SUBMIT_END_DAY,
    email_day: DEFAULT_EMAIL_DAY,
  };
}

export function memberNeedsCycleEmail(sentAt: string | null | undefined): boolean {
  return !sentAt;
}

export function planCycleEmailMembers(input: {
  kind: CycleEmailKind;
  members: readonly { id: string }[];
  sends: readonly CycleEmailSendRow[];
  submittedMemberIds?: Iterable<string>;
}): string[] {
  const sent = new Map(input.sends.map((row) => [row.member_id, row]));
  const submitted = new Set(input.submittedMemberIds ?? []);
  return input.members
    .filter((member) => {
      const row = sent.get(member.id);
      const stamped =
        input.kind === "open" ? row?.open_email_sent_at : row?.reminder_email_sent_at;
      if (!memberNeedsCycleEmail(stamped)) return false;
      if (input.kind === "reminder" && submitted.has(member.id)) return false;
      return true;
    })
    .map((member) => member.id);
}

export function submittedMemberIds(
  submissions: readonly { member_id: string; status?: string | null }[],
): string[] {
  return submissions.filter((row) => isSubmittedThisPeriod(row)).map((row) => row.member_id);
}

export function parseScheduleCatchUpForm(formData: FormData): {
  sendOpen: boolean;
  sendReminder: boolean;
} {
  return {
    sendOpen: String(formData.get(SEND_OPEN_EMAIL_FIELD) ?? "") === SEND_CYCLE_EMAIL_VALUE,
    sendReminder: String(formData.get(SEND_REMINDER_EMAIL_FIELD) ?? "") === SEND_CYCLE_EMAIL_VALUE,
  };
}

export type ScheduleCatchUpPrompts = {
  yearMonth: string | null;
  promptOpen: boolean;
  promptReminder: boolean;
};

/**
 * Owner date-change UI: if the in-play month's open or reminder day is today
 * or earlier and that email has not been sent, show the catch-up checkbox.
 * Unchecked send is a no-op: do not stamp.
 */
export function scheduleCatchUpPrompts(input: {
  group: CycleGroup;
  closedYearMonths: readonly string[];
  sent: CycleEmailSentMap;
  now?: Date;
}): ScheduleCatchUpPrompts {
  const now = input.now ?? new Date();
  const yearMonth = openSubmitYearMonth(input.group, input.closedYearMonths, now);
  if (!yearMonth) {
    return { yearMonth: null, promptOpen: false, promptReminder: false };
  }
  const today = chicagoDate(now);
  const flags = input.sent[yearMonth] ?? { open: false, reminder: false };
  const openDueOrPast =
    compareChicagoDate(cycleEmailDueDate("open", yearMonth, input.group), today) <= 0;
  const reminderDueOrPast =
    compareChicagoDate(cycleEmailDueDate("reminder", yearMonth, input.group), today) <= 0;
  return {
    yearMonth,
    promptOpen: openDueOrPast && !flags.open,
    promptReminder: reminderDueOrPast && !flags.reminder,
  };
}

export function shouldSendCatchUpNow(promptShown: boolean, checked: boolean): boolean {
  return promptShown && checked;
}

export function openEmailSubject(): string {
  return OPEN_EMAIL_SUBJECT;
}

export function reminderEmailSubject(): string {
  return REMINDER_EMAIL_SUBJECT;
}

export function openEmailText(input: {
  groupName: string;
  monthLabel: string;
  link: string;
}): string {
  const name = groupDisplayName(input.groupName);
  return [
    OPEN_EMAIL_SUBJECT,
    "",
    `${input.monthLabel} — ${name}`,
    "",
    `${CYCLE_EMAIL_BUTTON}: ${input.link}`,
  ].join("\n");
}

export function reminderEmailText(input: {
  groupName: string;
  monthLabel: string;
  link: string;
  closeLabel: string;
}): string {
  const name = groupDisplayName(input.groupName);
  return [
    REMINDER_EMAIL_SUBJECT,
    "",
    `${input.monthLabel} — ${name}`,
    "",
    `Submissions close on ${input.closeLabel}.`,
    "",
    `${CYCLE_EMAIL_BUTTON}: ${input.link}`,
  ].join("\n");
}

export function openEmailHtml(input: {
  groupName: string;
  monthLabel: string;
  link: string;
}): string {
  const name = groupDisplayName(input.groupName);
  return emailCardHtml({
    eyebrow: name,
    heading: OPEN_EMAIL_SUBJECT,
    body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">Writing is open for ${escapeHtml(input.monthLabel)}.</p>
      ${letterButton(input.link)}`,
  });
}

export function reminderEmailHtml(input: {
  groupName: string;
  monthLabel: string;
  link: string;
  closeLabel: string;
}): string {
  const name = groupDisplayName(input.groupName);
  return emailCardHtml({
    eyebrow: name,
    heading: REMINDER_EMAIL_SUBJECT,
    body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">Submissions close on ${escapeHtml(input.closeLabel)}.</p>
      ${letterButton(input.link)}`,
  });
}

function letterButton(link: string): string {
  return `<p style="margin:0 0 8px"><a href="${escapeAttr(link)}" style="display:inline-block;background:#24473c;color:#fffdf7;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px">${escapeHtml(CYCLE_EMAIL_BUTTON)}</a></p>`;
}

function emailCardHtml(input: { eyebrow: string; heading: string; body: string }): string {
  return `<div style="background:#f5f2ea;color:#1a1712;padding:24px 16px;font-family:ui-sans-serif,system-ui,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fffdf7;border:1px solid #e4ddce;border-radius:14px;padding:32px 24px">
      <p style="margin:0;letter-spacing:0.14em;text-transform:uppercase;font-size:11px;color:#7b7268">${escapeHtml(input.eyebrow)}</p>
      <h1 style="margin:8px 0 12px;font-family:Georgia,serif;font-size:28px;line-height:1.15">${escapeHtml(input.heading)}</h1>
      ${input.body}
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
