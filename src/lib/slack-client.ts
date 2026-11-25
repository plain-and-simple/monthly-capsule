import "server-only";

import { slackBotToken } from "@/lib/env";
import {
  awardsForChicagoMonth,
  chicagoMonthUnixRange,
  isIgnoredSlackMessage,
  type SlackAwardInputMessage,
  type SlackAwardsData,
} from "@/lib/slack-awards";

const SLACK_API = "https://slack.com/api/";
const MAX_ATTEMPTS = 4;
const MAX_PAGES = 40;

export class SlackApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackApiError";
  }
}

type SlackTransport = {
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type SlackCall = SlackTransport & {
  method: string;
  params: Record<string, string>;
  attempt?: number;
};

function retryAfterSeconds(header: string | null): number {
  const parsed = Number(header);
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return parsed;
}

/** Slack Web API POST. Retries HTTP 429 and `ratelimited`, waiting Retry-After. Never logs the token. */
export async function slackApiCall(input: SlackCall): Promise<Record<string, unknown>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempt = input.attempt ?? 0;
  const response = await fetchImpl(`${SLACK_API}${input.method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: new URLSearchParams(input.params),
  });

  if (response.status === 429) {
    await response.arrayBuffer().catch(() => undefined);
    if (attempt + 1 >= MAX_ATTEMPTS) throw new SlackApiError("ratelimited");
    await sleep(retryAfterSeconds(response.headers.get("Retry-After")) * 1000);
    return slackApiCall({ ...input, attempt: attempt + 1 });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SlackApiError("slack_bad_response");
  }
  if (!payload || typeof payload !== "object") throw new SlackApiError("slack_bad_response");
  const record = payload as Record<string, unknown>;
  if (record.ok !== true) {
    const code = typeof record.error === "string" && record.error ? record.error : "slack_error";
    if (code === "ratelimited" && attempt + 1 < MAX_ATTEMPTS) {
      await sleep(retryAfterSeconds(response.headers.get("Retry-After")) * 1000);
      return slackApiCall({ ...input, attempt: attempt + 1 });
    }
    throw new SlackApiError(code);
  }
  return record;
}

async function slackPages(input: SlackCall & { collectionKey: string }): Promise<unknown[]> {
  const items: unknown[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params: Record<string, string> = { ...input.params, limit: input.params.limit ?? "200" };
    if (cursor) params.cursor = cursor;
    const payload = await slackApiCall({ ...input, params });
    const chunk = payload[input.collectionKey];
    if (Array.isArray(chunk)) items.push(...chunk);
    const meta = payload.response_metadata;
    const next =
      meta && typeof meta === "object"
        ? String((meta as { next_cursor?: unknown }).next_cursor ?? "").trim()
        : "";
    if (!next) break;
    cursor = next;
  }
  return items;
}

type RawChannel = {
  id?: unknown;
  name?: unknown;
  is_member?: unknown;
  is_archived?: unknown;
  is_private?: unknown;
  is_channel?: unknown;
  is_group?: unknown;
  is_im?: unknown;
  is_mpim?: unknown;
};

/** Public and not archived. Missing flags stay eligible: conversations.list already asks for that set. */
function publicOpenChannel(item: unknown): { id: string; name: string; member: boolean } | null {
  if (!item || typeof item !== "object") return null;
  const channel = item as RawChannel;
  if (channel.is_archived === true) return null;
  if (channel.is_private === true) return null;
  if (channel.is_group === true) return null;
  if (channel.is_im === true) return null;
  if (channel.is_mpim === true) return null;
  if (channel.is_channel === false) return null;
  const id = typeof channel.id === "string" ? channel.id : "";
  const name = typeof channel.name === "string" ? channel.name : "";
  if (!id || !name) return null;
  return { id, name, member: channel.is_member === true };
}

type RawReaction = { name?: unknown; count?: unknown };
type RawMessage = {
  type?: unknown;
  subtype?: unknown;
  user?: unknown;
  bot_id?: unknown;
  text?: unknown;
  ts?: unknown;
  thread_ts?: unknown;
  reply_count?: unknown;
  reactions?: unknown;
};

function asReactions(value: unknown): { name: string; count: number }[] {
  if (!Array.isArray(value)) return [];
  const reactions: { name: string; count: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const reaction = item as RawReaction;
    const name = typeof reaction.name === "string" ? reaction.name : "";
    const count = Number(reaction.count);
    if (!name || !Number.isFinite(count)) continue;
    reactions.push({ name, count });
  }
  return reactions;
}

function displayNameOf(user: Record<string, unknown>): string {
  const profile =
    user.profile && typeof user.profile === "object" ? (user.profile as Record<string, unknown>) : {};
  const display = typeof profile.display_name === "string" ? profile.display_name.trim() : "";
  if (display) return display;
  const profileReal = typeof profile.real_name === "string" ? profile.real_name.trim() : "";
  if (profileReal) return profileReal;
  const real = typeof user.real_name === "string" ? user.real_name.trim() : "";
  if (real) return real;
  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (name) return name;
  return "Someone";
}

async function replyCountFor(
  input: SlackTransport,
  channelId: string,
  message: RawMessage,
): Promise<number> {
  if (typeof message.reply_count === "number" && Number.isFinite(message.reply_count)) {
    return message.reply_count;
  }
  const ts = typeof message.ts === "string" ? message.ts : "";
  const threadTs = typeof message.thread_ts === "string" ? message.thread_ts : "";
  if (!ts || threadTs !== ts) return 0;
  const replies = await slackPages({
    ...input,
    method: "conversations.replies",
    params: { channel: channelId, ts },
    collectionKey: "messages",
  });
  let count = 0;
  for (const item of replies) {
    if (!item || typeof item !== "object") continue;
    const reply = item as RawMessage;
    if (reply.ts === ts) continue;
    const userId = typeof reply.user === "string" ? reply.user : "";
    const subtype = typeof reply.subtype === "string" ? reply.subtype : null;
    if (
      isIgnoredSlackMessage({
        bot: Boolean(reply.bot_id) || subtype === "bot_message",
        subtype,
        userId,
      })
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

/**
 * Public, non-archived channels for one America/Chicago calendar month.
 * Joins any the bot is not already in, then reads history for members, including ones just joined.
 * A join error skips that channel and does not fail the job.
 * `conversations.replies` runs only when a parent has no reply_count.
 */
export async function collectSlackAwards(input: {
  token: string;
  writingMonth: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SlackAwardsData> {
  const range = chicagoMonthUnixRange(input.writingMonth);
  if (!range) return awardsForChicagoMonth([], input.writingMonth);
  const transport: SlackTransport = {
    token: input.token,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  };
  const channels = await slackPages({
    ...transport,
    method: "conversations.list",
    params: { types: "public_channel", exclude_archived: "true" },
    collectionKey: "channels",
  });

  const messages: SlackAwardInputMessage[] = [];
  const names = new Map<string, string>();
  const bots = new Set<string>();

  const readable: { id: string; name: string }[] = [];
  for (const item of channels) {
    const channel = publicOpenChannel(item);
    if (!channel) continue;
    if (!channel.member) {
      try {
        await slackApiCall({
          ...transport,
          method: "conversations.join",
          params: { channel: channel.id },
        });
      } catch {
        // One channel can refuse the join. Skip it and keep the rest of the job going.
        continue;
      }
    }
    readable.push({ id: channel.id, name: channel.name });
  }

  for (const channel of readable) {
    const channelId = channel.id;
    const channelName = channel.name;
    const history = await slackPages({
      ...transport,
      method: "conversations.history",
      params: {
        channel: channelId,
        oldest: range.start.toFixed(6),
        // `end` is 23:59:59. The next second is the following month, so ask through that instant.
        latest: (range.end + 1).toFixed(6),
        inclusive: "true",
      },
      collectionKey: "messages",
    });
    for (const raw of history) {
      if (!raw || typeof raw !== "object") continue;
      const message = raw as RawMessage;
      if (message.type && message.type !== "message") continue;
      const userId = typeof message.user === "string" ? message.user : "";
      const subtype = typeof message.subtype === "string" ? message.subtype : null;
      const bot = Boolean(message.bot_id) || subtype === "bot_message";
      const ts = typeof message.ts === "string" ? message.ts : "";
      if (!ts) continue;
      const ignored = isIgnoredSlackMessage({ bot, subtype, userId });
      const replyCount = ignored ? 0 : await replyCountFor(transport, channelId, message);
      messages.push({
        channelName,
        userId,
        text: typeof message.text === "string" ? message.text : "",
        ts,
        replyCount,
        reactions: asReactions(message.reactions),
        bot,
        subtype,
      });
    }
  }

  const userIds = new Set<string>();
  for (const message of messages) {
    if (message.userId && !isIgnoredSlackMessage(message)) userIds.add(message.userId);
  }
  for (const userId of userIds) {
    try {
      const payload = await slackApiCall({
        ...transport,
        method: "users.info",
        params: { user: userId },
      });
      const user = payload.user;
      if (!user || typeof user !== "object") continue;
      const record = user as Record<string, unknown>;
      if (record.is_bot === true) bots.add(userId);
      names.set(userId, displayNameOf(record));
    } catch {
      names.set(userId, "Someone");
    }
  }

  const named = messages.map((message) => ({
    ...message,
    displayName: names.get(message.userId) || message.displayName || "Someone",
    bot: message.bot || bots.has(message.userId),
  }));
  return awardsForChicagoMonth(named, input.writingMonth);
}

export function requireSlackBotToken(): string {
  const token = slackBotToken();
  if (!token) throw new SlackApiError("slack_token_missing");
  return token;
}
