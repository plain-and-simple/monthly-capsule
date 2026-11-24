import {
  chicagoDate,
  cycleCloseChicagoDate,
  nextYearMonth,
  parseYearMonth,
  previousYearMonth,
  writingYearMonth,
  yearMonthString,
  type ChicagoDate,
  type ScheduleDays,
} from "@/lib/schedule";

export const SLACK_AWARD_TEXT_MAX = 200;
export const SLACK_AWARD_NAME_MAX = 80;

export const SLACK_AWARD_PLACES = ["gold", "silver", "bronze"] as const;
export type SlackAwardPlace = (typeof SLACK_AWARD_PLACES)[number];

export type SlackSenderAward = {
  place: SlackAwardPlace;
  name: string;
  count: number;
};

export type SlackChannelAward = {
  name: string;
  count: number;
};

export type SlackReplyAward = {
  name: string;
  channel: string;
  replyCount: number;
  text: string;
};

export type SlackReactionAward = {
  name: string;
  channel: string;
  reactionTotal: number;
  topEmoji: string;
  text: string;
};

export type SlackAwardsData = {
  senders: SlackSenderAward[];
  channel: SlackChannelAward | null;
  mostReplies: SlackReplyAward | null;
  mostReactions: SlackReactionAward | null;
};

export type SlackAwardInputMessage = {
  channelName: string;
  userId: string;
  displayName?: string;
  text: string;
  ts: string;
  replyCount?: number | null;
  reactions?: { name: string; count: number }[];
  bot?: boolean;
  subtype?: string | null;
};

export type SlackAwardsRow = {
  data: SlackAwardsData;
  owner_edited: boolean;
  hidden: boolean;
  generated_at: string | null;
};

const SYSTEM_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "pinned_item",
  "unpinned_item",
  "bot_add",
  "bot_remove",
  "reminder_add",
  "ekm_access_denied",
  "channel_posting_permissions",
]);

const CHICAGO = "America/Chicago";

export function emptySlackAwards(): SlackAwardsData {
  return { senders: [], channel: null, mostReplies: null, mostReactions: null };
}

export function truncateAwardText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= SLACK_AWARD_TEXT_MAX) return flat;
  return flat.slice(0, SLACK_AWARD_TEXT_MAX);
}

export function clipAwardName(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= SLACK_AWARD_NAME_MAX) return flat;
  return flat.slice(0, SLACK_AWARD_NAME_MAX);
}

/** Strip secrets and Slack-looking ids before anything is logged. */
export function maskSlackOpsDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : "slack_awards_failed";
  const masked = raw
    .replace(/xox[a-z]-[A-Za-z0-9-]+/gi, "[token]")
    .replace(/Bearer\s+\S+/gi, "Bearer [token]")
    .replace(/\b[UBCDGW][A-Z0-9]{8,}\b/g, "[id]");
  const trimmed = masked.trim();
  return (trimmed || "slack_awards_failed").slice(0, 160);
}

export function slackTsSeconds(ts: string): number {
  const value = Number(ts);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function chicagoOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
  return asUtc - instant.getTime();
}

/** UTC instant of a wall-clock time in America/Chicago. */
export function chicagoLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = chicagoOffsetMs(new Date(utcGuess));
  let instant = utcGuess - offset;
  const offsetAtInstant = chicagoOffsetMs(new Date(instant));
  if (offsetAtInstant !== offset) instant = utcGuess - offsetAtInstant;
  return new Date(instant);
}

/** [start, end) unix seconds for a calendar month in America/Chicago. */
export function chicagoMonthUnixRange(yearMonth: string): { start: number; end: number } | null {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return null;
  const start = chicagoLocalToUtc(parsed.year, parsed.month, 1);
  const next =
    parsed.month === 12
      ? chicagoLocalToUtc(parsed.year + 1, 1, 1)
      : chicagoLocalToUtc(parsed.year, parsed.month + 1, 1);
  return { start: start.getTime() / 1000, end: next.getTime() / 1000 };
}

export function shiftChicagoDate(date: ChicagoDate, days: number): ChicagoDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function sameChicagoDay(a: ChicagoDate, b: ChicagoDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Capsule cycle whose submit close is tomorrow in America/Chicago.
 * Null on every other day.
 */
export function slackAwardsDueCycle(
  schedule: Pick<ScheduleDays, "submit_end_day">,
  now: Date,
): string | null {
  const today = chicagoDate(now);
  const months = [previousYearMonth(today), yearMonthString(today), nextYearMonth(today)];
  for (const yearMonth of months) {
    const close = cycleCloseChicagoDate(yearMonth, schedule.submit_end_day);
    if (sameChicagoDay(shiftChicagoDate(close, -1), today)) return yearMonth;
  }
  return null;
}

/** Slack history window for a capsule cycle: the writing month (cycle minus one). */
export function slackHistoryYearMonth(cycleYearMonth: string): string {
  return writingYearMonth(cycleYearMonth);
}

export function isIgnoredSlackMessage(message: {
  bot?: boolean;
  subtype?: string | null;
  userId?: string;
}): boolean {
  if (message.bot) return true;
  if (!message.userId) return true;
  const subtype = message.subtype ?? "";
  if (!subtype) return false;
  if (subtype === "bot_message") return true;
  if (SYSTEM_SUBTYPES.has(subtype)) return true;
  if (subtype.startsWith("channel_") || subtype.startsWith("group_")) return true;
  return false;
}

export function filterMessagesToChicagoMonth<T extends { ts: string }>(
  messages: readonly T[],
  yearMonth: string,
): T[] {
  const range = chicagoMonthUnixRange(yearMonth);
  if (!range) return [];
  return messages.filter((message) => {
    const ts = slackTsSeconds(message.ts);
    return ts >= range.start && ts < range.end;
  });
}

function reactionTotal(reactions: { name: string; count: number }[] | undefined): number {
  let total = 0;
  for (const reaction of reactions ?? []) {
    if (Number.isFinite(reaction.count) && reaction.count > 0) total += reaction.count;
  }
  return total;
}

function topEmoji(reactions: { name: string; count: number }[] | undefined): string {
  const ranked = [...(reactions ?? [])].filter((reaction) => reaction.name && reaction.count > 0);
  ranked.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return ranked[0]?.name ?? "";
}

function placeForIndex(index: number): SlackAwardPlace | null {
  return SLACK_AWARD_PLACES[index] ?? null;
}

export function computeSlackAwards(messages: readonly SlackAwardInputMessage[]): SlackAwardsData {
  const countable = messages.filter(
    (message) =>
      !isIgnoredSlackMessage({
        bot: message.bot,
        subtype: message.subtype,
        userId: message.userId,
      }),
  );

  type Sender = { userId: string; name: string; count: number; earliest: number };
  const senders = new Map<string, Sender>();
  type Channel = { name: string; count: number; earliest: number };
  const channels = new Map<string, Channel>();

  let replies: { message: SlackAwardInputMessage; count: number; ts: number } | null = null;
  let reactions: { message: SlackAwardInputMessage; total: number; ts: number } | null = null;

  for (const message of countable) {
    const ts = slackTsSeconds(message.ts);
    const name = clipAwardName(message.displayName || "Someone");
    const sender = senders.get(message.userId);
    if (!sender) {
      senders.set(message.userId, { userId: message.userId, name, count: 1, earliest: ts });
    } else {
      sender.count += 1;
      if (ts < sender.earliest) {
        sender.earliest = ts;
        sender.name = name;
      }
    }

    const channelName = clipAwardName(message.channelName);
    if (channelName) {
      const channel = channels.get(channelName);
      if (!channel) {
        channels.set(channelName, { name: channelName, count: 1, earliest: ts });
      } else {
        channel.count += 1;
        if (ts < channel.earliest) channel.earliest = ts;
      }
    }

    const replyCount = Number(message.replyCount ?? 0);
    if (Number.isFinite(replyCount) && replyCount > 0) {
      if (
        !replies ||
        replyCount > replies.count ||
        (replyCount === replies.count && ts < replies.ts)
      ) {
        replies = { message, count: replyCount, ts };
      }
    }

    const total = reactionTotal(message.reactions);
    if (total > 0) {
      if (
        !reactions ||
        total > reactions.total ||
        (total === reactions.total && ts < reactions.ts)
      ) {
        reactions = { message, total, ts };
      }
    }
  }

  const rankedSenders = [...senders.values()].sort(
    (a, b) => b.count - a.count || a.earliest - b.earliest || a.name.localeCompare(b.name),
  );
  const rankedChannels = [...channels.values()].sort(
    (a, b) => b.count - a.count || a.earliest - b.earliest || a.name.localeCompare(b.name),
  );
  const topChannel = rankedChannels[0];

  return {
    senders: rankedSenders.slice(0, 3).flatMap((sender, index) => {
      const place = placeForIndex(index);
      if (!place) return [];
      return [{ place, name: sender.name, count: sender.count }];
    }),
    channel: topChannel ? { name: topChannel.name, count: topChannel.count } : null,
    mostReplies: replies
      ? {
          name: clipAwardName(replies.message.displayName || "Someone"),
          channel: clipAwardName(replies.message.channelName),
          replyCount: replies.count,
          text: truncateAwardText(replies.message.text),
        }
      : null,
    mostReactions: reactions
      ? {
          name: clipAwardName(reactions.message.displayName || "Someone"),
          channel: clipAwardName(reactions.message.channelName),
          reactionTotal: reactions.total,
          topEmoji: topEmoji(reactions.message.reactions).slice(0, 64),
          text: truncateAwardText(reactions.message.text),
        }
      : null,
  };
}

export function awardsForChicagoMonth(
  messages: readonly SlackAwardInputMessage[],
  yearMonth: string,
): SlackAwardsData {
  return computeSlackAwards(filterMessagesToChicagoMonth(messages, yearMonth));
}

export function channelLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function emojiLabel(name: string): string {
  const trimmed = name.trim().replace(/:/g, "");
  if (!trimmed) return "";
  return `:${trimmed}:`;
}

export function placeLabel(place: SlackAwardPlace): string {
  if (place === "gold") return "Gold";
  if (place === "silver") return "Silver";
  return "Bronze";
}

export function slackAwardsLines(awards: SlackAwardsData): string[] {
  const lines: string[] = [];
  for (const sender of awards.senders) {
    lines.push(`${placeLabel(sender.place)} · ${sender.name} · ${sender.count}`);
  }
  if (awards.channel) {
    lines.push(`Most active channel · ${channelLabel(awards.channel.name)} · ${awards.channel.count}`);
  }
  if (awards.mostReplies) {
    lines.push(
      `Most replies · ${awards.mostReplies.name} in ${channelLabel(awards.mostReplies.channel)} · ${awards.mostReplies.replyCount}`,
    );
    if (awards.mostReplies.text) lines.push(awards.mostReplies.text);
  }
  if (awards.mostReactions) {
    const emoji = emojiLabel(awards.mostReactions.topEmoji);
    const emojiBit = emoji ? ` · ${emoji}` : "";
    lines.push(
      `Most reactions · ${awards.mostReactions.name} in ${channelLabel(awards.mostReactions.channel)} · ${awards.mostReactions.reactionTotal}${emojiBit}`,
    );
    if (awards.mostReactions.text) lines.push(awards.mostReactions.text);
  }
  return lines;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Empty string when there is nothing to show. */
export function renderSlackAwardsSectionHtml(awards: SlackAwardsData | null | undefined): string {
  if (!awards) return "";
  const lines = slackAwardsLines(awards);
  const items =
    lines.length === 0
      ? `<p>Nothing to award this month.</p>`
      : `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  return `<section class="slack-awards" aria-label="Slack awards"><h2>Slack awards</h2>${items}</section>`;
}

export function visibleSlackAwards(input: {
  enabled: boolean;
  hidden?: boolean;
  data?: SlackAwardsData | null;
}): SlackAwardsData | null {
  if (!input.enabled) return null;
  if (input.hidden) return null;
  if (!input.data) return null;
  return input.data;
}

export function applyGeneratedSlackAwards(
  existing: SlackAwardsRow | null,
  next: SlackAwardsData,
  nowIso: string,
): { action: "insert" | "update" | "skip"; row?: SlackAwardsRow } {
  if (existing?.owner_edited) return { action: "skip" };
  const row: SlackAwardsRow = {
    data: next,
    owner_edited: false,
    hidden: existing?.hidden ?? false,
    generated_at: nowIso,
  };
  return { action: existing ? "update" : "insert", row };
}

export function slackRefreshAllowed(ownerEdited: boolean, confirmed: boolean): boolean {
  if (!ownerEdited) return true;
  return confirmed;
}

export type SlackAwardsGateway = {
  read(groupId: string, yearMonth: string): Promise<SlackAwardsRow | null>;
  insert(groupId: string, yearMonth: string, row: SlackAwardsRow): Promise<"ok" | "conflict">;
  updateUnedited(groupId: string, yearMonth: string, row: SlackAwardsRow): Promise<boolean>;
};

export async function saveGeneratedSlackAwards(
  gateway: SlackAwardsGateway,
  input: { groupId: string; yearMonth: string; data: SlackAwardsData; nowIso: string },
): Promise<"saved" | "skipped"> {
  const existing = await gateway.read(input.groupId, input.yearMonth);
  const plan = applyGeneratedSlackAwards(existing, input.data, input.nowIso);
  if (plan.action === "skip" || !plan.row) return "skipped";
  if (plan.action === "insert") {
    const inserted = await gateway.insert(input.groupId, input.yearMonth, plan.row);
    if (inserted === "ok") return "saved";
    const again = await gateway.read(input.groupId, input.yearMonth);
    const retry = applyGeneratedSlackAwards(again, input.data, input.nowIso);
    if (retry.action !== "update" || !retry.row) return "skipped";
    const updated = await gateway.updateUnedited(input.groupId, input.yearMonth, retry.row);
    return updated ? "saved" : "skipped";
  }
  const updated = await gateway.updateUnedited(input.groupId, input.yearMonth, plan.row);
  return updated ? "saved" : "skipped";
}

export async function loadVisibleSlackAwardsFrom(input: {
  enabled: boolean;
  hidden?: boolean;
  read: () => Promise<SlackAwardsRow | null>;
}): Promise<SlackAwardsData | undefined> {
  try {
    if (!input.enabled) return undefined;
    const row = await input.read();
    if (!row) return undefined;
    return (
      visibleSlackAwards({
        enabled: true,
        hidden: input.hidden ?? row.hidden,
        data: row.data,
      }) ?? undefined
    );
  } catch (error) {
    console.error("slack awards skipped", maskSlackOpsDetail(error));
    return undefined;
  }
}

/**
 * Run primary cron work first. A Slack failure is logged and does not reject.
 */
export async function afterPrimaryWork<T>(
  primary: () => Promise<T>,
  secondary: () => Promise<void>,
): Promise<T> {
  const results = await primary();
  try {
    await secondary();
  } catch (error) {
    console.error("slack awards skipped", maskSlackOpsDetail(error));
  }
  return results;
}

export async function runSlackAwardsForGroups(input: {
  groups: readonly {
    id: string;
    slack_awards_enabled?: boolean;
    submit_end_day: number;
  }[];
  now: Date;
  generate: (groupId: string, yearMonth: string) => Promise<void>;
}): Promise<void> {
  for (const group of input.groups) {
    if (group.slack_awards_enabled !== true) continue;
    const yearMonth = slackAwardsDueCycle(group, input.now);
    if (!yearMonth) continue;
    try {
      await input.generate(group.id, yearMonth);
    } catch (error) {
      console.error("slack awards skipped", maskSlackOpsDetail(error));
    }
  }
}

function readTrimmed(formData: FormData, name: string, max: number): string {
  return truncateTo(String(formData.get(name) ?? ""), max);
}

function truncateTo(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max);
}

function readCount(formData: FormData, name: string): number | "empty" | "invalid" {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return "empty";
  if (!/^\d{1,6}$/.test(raw)) return "invalid";
  return Number(raw);
}

function isPlace(value: string): value is SlackAwardPlace {
  return (SLACK_AWARD_PLACES as readonly string[]).includes(value);
}

export function parseSlackAwardsData(value: unknown): SlackAwardsData | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SlackAwardsData>;
  if (!Array.isArray(row.senders)) return null;
  const senders: SlackSenderAward[] = [];
  for (const sender of row.senders) {
    if (!sender || typeof sender !== "object") return null;
    const place = (sender as SlackSenderAward).place;
    const name = (sender as SlackSenderAward).name;
    const count = (sender as SlackSenderAward).count;
    if (!isPlace(String(place))) return null;
    if (typeof name !== "string" || !name.trim()) return null;
    if (!Number.isInteger(count) || count < 0) return null;
    senders.push({ place, name: clipAwardName(name), count });
  }
  let channel: SlackChannelAward | null = null;
  if (row.channel != null) {
    if (typeof row.channel !== "object") return null;
    const name = row.channel.name;
    const count = row.channel.count;
    if (typeof name !== "string" || !name.trim()) return null;
    if (!Number.isInteger(count) || count < 0) return null;
    channel = { name: clipAwardName(name), count };
  }
  const mostReplies = parseReply(row.mostReplies);
  if (mostReplies === "invalid") return null;
  const mostReactions = parseReactions(row.mostReactions);
  if (mostReactions === "invalid") return null;
  return {
    senders,
    channel,
    mostReplies,
    mostReactions,
  };
}

function parseReply(value: SlackAwardsData["mostReplies"] | undefined): SlackReplyAward | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "object") return "invalid";
  if (typeof value.name !== "string" || typeof value.channel !== "string" || typeof value.text !== "string") {
    return "invalid";
  }
  if (!Number.isInteger(value.replyCount) || value.replyCount < 0) return "invalid";
  return {
    name: clipAwardName(value.name),
    channel: clipAwardName(value.channel),
    replyCount: value.replyCount,
    text: truncateAwardText(value.text),
  };
}

function parseReactions(
  value: SlackAwardsData["mostReactions"] | undefined,
): SlackReactionAward | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "object") return "invalid";
  if (
    typeof value.name !== "string" ||
    typeof value.channel !== "string" ||
    typeof value.text !== "string" ||
    typeof value.topEmoji !== "string"
  ) {
    return "invalid";
  }
  if (!Number.isInteger(value.reactionTotal) || value.reactionTotal < 0) return "invalid";
  return {
    name: clipAwardName(value.name),
    channel: clipAwardName(value.channel),
    reactionTotal: value.reactionTotal,
    topEmoji: value.topEmoji.replace(/:/g, "").slice(0, 64),
    text: truncateAwardText(value.text),
  };
}

export function parseSlackAwardsForm(formData: FormData): { data: SlackAwardsData } | { error: string } {
  const senders: SlackSenderAward[] = [];
  for (const place of SLACK_AWARD_PLACES) {
    const name = readTrimmed(formData, `sender_${place}_name`, SLACK_AWARD_NAME_MAX);
    const count = readCount(formData, `sender_${place}_count`);
    if (!name && count === "empty") continue;
    if (!name || count === "empty" || count === "invalid") return { error: "Check the awards fields." };
    senders.push({ place, name, count });
  }

  const channelName = readTrimmed(formData, "channel_name", SLACK_AWARD_NAME_MAX);
  const channelCount = readCount(formData, "channel_count");
  let channel: SlackChannelAward | null = null;
  if (channelName || channelCount !== "empty") {
    if (!channelName || channelCount === "empty" || channelCount === "invalid") {
      return { error: "Check the awards fields." };
    }
    channel = { name: channelName.replace(/^#/, ""), count: channelCount };
  }

  const replies = readQuote(formData, "replies");
  if ("error" in replies) return replies;
  const reactions = readReactions(formData);
  if ("error" in reactions) return reactions;

  return {
    data: {
      senders,
      channel,
      mostReplies: replies.award,
      mostReactions: reactions.award,
    },
  };
}

function readQuote(
  formData: FormData,
  prefix: "replies",
): { award: SlackReplyAward | null } | { error: string } {
  const name = readTrimmed(formData, `${prefix}_name`, SLACK_AWARD_NAME_MAX);
  const channel = readTrimmed(formData, `${prefix}_channel`, SLACK_AWARD_NAME_MAX).replace(/^#/, "");
  const text = readTrimmed(formData, `${prefix}_text`, SLACK_AWARD_TEXT_MAX);
  const count = readCount(formData, `${prefix}_count`);
  if (!name && !channel && !text && count === "empty") return { award: null };
  if (!name || !channel || count === "empty" || count === "invalid") {
    return { error: "Check the awards fields." };
  }
  return { award: { name, channel, replyCount: count, text } };
}

function readReactions(formData: FormData): { award: SlackReactionAward | null } | { error: string } {
  const name = readTrimmed(formData, "reactions_name", SLACK_AWARD_NAME_MAX);
  const channel = readTrimmed(formData, "reactions_channel", SLACK_AWARD_NAME_MAX).replace(/^#/, "");
  const text = readTrimmed(formData, "reactions_text", SLACK_AWARD_TEXT_MAX);
  const emoji = readTrimmed(formData, "reactions_emoji", 64).replace(/:/g, "");
  const count = readCount(formData, "reactions_total");
  if (!name && !channel && !text && !emoji && count === "empty") return { award: null };
  if (!name || !channel || count === "empty" || count === "invalid") {
    return { error: "Check the awards fields." };
  }
  return {
    award: { name, channel, reactionTotal: count, topEmoji: emoji, text },
  };
}
