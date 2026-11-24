import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildCapsuleArchive, parseCapsuleArchive } from "@/lib/capsule-archive";
import type { DocumentPlan } from "@/lib/capsule-b2";
import { appendSlackAwardsPage } from "@/lib/slack-awards-page";
import { collectSlackAwards, slackApiCall } from "@/lib/slack-client";
import {
  afterPrimaryWork,
  awardsForChicagoMonth,
  chicagoLocalToUtc,
  chicagoMonthUnixRange,
  computeSlackAwards,
  loadVisibleSlackAwardsFrom,
  maskSlackOpsDetail,
  renderSlackAwardsSectionHtml,
  runSlackAwardsForGroups,
  saveGeneratedSlackAwards,
  slackAwardsDueCycle,
  slackHistoryYearMonth,
  slackRefreshAllowed,
  visibleSlackAwards,
  type SlackAwardInputMessage,
  type SlackAwardsData,
  type SlackAwardsGateway,
  type SlackAwardsRow,
} from "@/lib/slack-awards";

const here = resolve(__dirname);

function message(partial: Partial<SlackAwardInputMessage> & Pick<SlackAwardInputMessage, "userId" | "ts">): SlackAwardInputMessage {
  return {
    channelName: "lantern-room",
    displayName: "Pip",
    text: "The kettle is on.",
    replyCount: 0,
    reactions: [],
    ...partial,
  };
}

function sampleAwards(): SlackAwardsData {
  return {
    senders: [
      { place: "gold", name: "Pip", count: 4 },
      { place: "silver", name: "Nim", count: 3 },
      { place: "bronze", name: "Lark", count: 2 },
    ],
    channel: { name: "lantern-room", count: 9 },
    mostReplies: {
      name: "Nim",
      channel: "lantern-room",
      replyCount: 6,
      text: "Bring the mugs.",
    },
    mostReactions: {
      name: "Lark",
      channel: "kettle-wharf",
      reactionTotal: 5,
      topEmoji: "spark",
      text: "The north stair creaks.",
    },
  };
}

describe("slack award stats", () => {
  it("breaks ties by the earliest message", () => {
    const long = "m".repeat(250);
    const awards = computeSlackAwards([
      message({ userId: "person-nim", displayName: "Nim", ts: "10", text: long, replyCount: 3, reactions: [
        { name: "spark", count: 2 },
        { name: "owl", count: 2 },
      ] }),
      message({ userId: "person-nim", displayName: "Nim", ts: "11", channelName: "kettle-wharf" }),
      message({ userId: "person-pip", displayName: "Pip", ts: "20", replyCount: 3, reactions: [{ name: "star", count: 4 }] }),
      message({ userId: "person-pip", displayName: "Pip", ts: "21" }),
      message({ userId: "person-lark", displayName: "Lark", ts: "5", channelName: "kettle-wharf" }),
      message({ userId: "person-lark", displayName: "Lark", ts: "6", channelName: "kettle-wharf" }),
      message({ userId: "person-lark", displayName: "Lark", ts: "7", channelName: "kettle-wharf" }),
    ]);

    expect(awards.senders.map((sender) => sender.name)).toEqual(["Lark", "Nim", "Pip"]);
    expect(awards.senders.map((sender) => sender.place)).toEqual(["gold", "silver", "bronze"]);
    expect(awards.channel).toEqual({ name: "kettle-wharf", count: 4 });
    expect(awards.mostReplies?.name).toBe("Nim");
    expect(awards.mostReplies?.text).toBe("m".repeat(200));
    expect(awards.mostReplies?.text.length).toBe(200);
    expect(awards.mostReactions?.name).toBe("Nim");
    expect(awards.mostReactions?.topEmoji).toBe("owl");
  });

  it("drops bot messages and system subtypes", () => {
    const awards = computeSlackAwards([
      message({ userId: "person-pip", displayName: "Pip", ts: "10", replyCount: 1 }),
      message({
        userId: "person-helper",
        displayName: "Helper",
        ts: "11",
        bot: true,
        replyCount: 40,
        reactions: [{ name: "tada", count: 12 }],
        text: "I am a bot.",
      }),
      message({
        userId: "person-nim",
        displayName: "Nim",
        ts: "12",
        subtype: "channel_join",
        text: "joined",
        replyCount: 8,
      }),
      message({
        userId: "person-nim",
        displayName: "Nim",
        ts: "13",
        subtype: "channel_leave",
        text: "left",
      }),
    ]);

    expect(awards.senders).toEqual([{ place: "gold", name: "Pip", count: 1 }]);
    expect(awards.mostReplies?.name).toBe("Pip");
    expect(awards.mostReactions).toBeNull();
    expect(awards.channel).toEqual({ name: "lantern-room", count: 1 });
  });

  it("counts only the America/Chicago calendar month", () => {
    expect(chicagoLocalToUtc(2026, 3, 1).toISOString()).toBe("2026-03-01T06:00:00.000Z");
    expect(chicagoLocalToUtc(2026, 4, 1).toISOString()).toBe("2026-04-01T05:00:00.000Z");
    expect(chicagoLocalToUtc(2026, 11, 1).toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(chicagoLocalToUtc(2026, 12, 1).toISOString()).toBe("2026-12-01T06:00:00.000Z");

    const march = chicagoMonthUnixRange("2026-03");
    expect(march).not.toBeNull();
    const start = march!.start;
    const end = march!.end;
    const awards = awardsForChicagoMonth(
      [
        message({
          userId: "person-otter",
          displayName: "Otter",
          ts: (start - 1).toFixed(6),
          replyCount: 9,
          text: "Still February.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: start.toFixed(6),
          text: "March begins.",
        }),
        message({
          userId: "person-nim",
          displayName: "Nim",
          ts: (end - 1).toFixed(6),
          text: "March ends.",
        }),
        message({
          userId: "person-lark",
          displayName: "Lark",
          ts: end.toFixed(6),
          replyCount: 7,
          text: "April begins.",
        }),
      ],
      "2026-03",
    );

    expect(awards.senders.map((sender) => sender.name)).toEqual(["Pip", "Nim"]);
    expect(awards.mostReplies).toBeNull();
    expect(slackHistoryYearMonth("2026-10")).toBe("2026-09");
    expect(slackHistoryYearMonth("2026-01")).toBe("2025-12");
    expect(slackAwardsDueCycle({ submit_end_day: 8 }, new Date("2026-10-07T17:00:00.000Z"))).toBe("2026-10");
    expect(slackAwardsDueCycle({ submit_end_day: 8 }, new Date("2026-10-08T17:00:00.000Z"))).toBeNull();
    expect(slackAwardsDueCycle({ submit_end_day: 1 }, new Date("2026-02-28T18:00:00.000Z"))).toBe("2026-03");
  });
});

describe("slack award writes", () => {
  function memory(initial: SlackAwardsRow | null): {
    state: { stored: SlackAwardsRow | null; updates: number };
    gateway: SlackAwardsGateway;
  } {
    const state: { stored: SlackAwardsRow | null; updates: number } = { stored: initial, updates: 0 };
    return {
      state,
      gateway: {
        async read() {
          return state.stored;
        },
        async insert(_groupId, _yearMonth, row) {
          if (state.stored) return "conflict";
          state.stored = row;
          return "ok";
        },
        async updateUnedited(_groupId, _yearMonth, row) {
          if (!state.stored || state.stored.owner_edited) return false;
          state.stored = row;
          state.updates += 1;
          return true;
        },
      },
    };
  }

  const next: SlackAwardsData = {
    senders: [{ place: "gold", name: "Pip", count: 2 }],
    channel: null,
    mostReplies: null,
    mostReactions: null,
  };

  it("does not overwrite a row the owner edited", async () => {
    const { state, gateway } = memory({
      data: next,
      owner_edited: true,
      hidden: true,
      generated_at: "2026-10-07T00:00:00.000Z",
    });
    const result = await saveGeneratedSlackAwards(gateway, {
      groupId: "group-lantern",
      yearMonth: "2026-10",
      data: { ...next, senders: [{ place: "gold", name: "Otter", count: 9 }] },
      nowIso: "2026-10-07T12:00:00.000Z",
    });
    expect(result).toBe("skipped");
    expect(state.stored?.data.senders[0]?.name).toBe("Pip");
    expect(state.stored?.hidden).toBe(true);
    expect(state.updates).toBe(0);
  });

  it("inserts when no row exists and keeps hidden on a later generated update", async () => {
    const { state, gateway } = memory(null);
    expect(
      await saveGeneratedSlackAwards(gateway, {
        groupId: "group-lantern",
        yearMonth: "2026-10",
        data: next,
        nowIso: "2026-10-07T12:00:00.000Z",
      }),
    ).toBe("saved");
    expect(state.stored?.owner_edited).toBe(false);
    if (state.stored) state.stored = { ...state.stored, hidden: true };
    const replacement: SlackAwardsData = {
      ...next,
      senders: [{ place: "gold", name: "Nim", count: 3 }],
    };
    expect(
      await saveGeneratedSlackAwards(gateway, {
        groupId: "group-lantern",
        yearMonth: "2026-10",
        data: replacement,
        nowIso: "2026-10-07T13:00:00.000Z",
      }),
    ).toBe("saved");
    expect(state.stored?.data.senders[0]?.name).toBe("Nim");
    expect(state.stored?.hidden).toBe(true);
    expect(state.stored?.owner_edited).toBe(false);
  });

  it("skips when an owner edit wins the insert race", async () => {
    let reads = 0;
    const gateway: SlackAwardsGateway = {
      async read() {
        reads += 1;
        if (reads === 1) return null;
        return { data: next, owner_edited: true, hidden: false, generated_at: null };
      },
      async insert() {
        return "conflict";
      },
      async updateUnedited() {
        throw new Error("should not update an edited row");
      },
    };
    await expect(
      saveGeneratedSlackAwards(gateway, {
        groupId: "group-lantern",
        yearMonth: "2026-10",
        data: next,
        nowIso: "2026-10-07T12:00:00.000Z",
      }),
    ).resolves.toBe("skipped");
  });

  it("blocks refresh after an owner edit until they confirm", () => {
    expect(slackRefreshAllowed(false, false)).toBe(true);
    expect(slackRefreshAllowed(true, false)).toBe(false);
    expect(slackRefreshAllowed(true, true)).toBe(true);
  });
});

describe("slack failures and omitted sections", () => {
  it("still returns compile results when Slack throws, and masks the token", async () => {
    const secret = ["xox", "b-not-a-real-token"].join("");
    const logs: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const result = await afterPrimaryWork(
        async () => ["compiled"],
        async () => {
          throw new Error(`rejected ${secret}`);
        },
      );
      expect(result).toEqual(["compiled"]);
      expect(logs.join(" ")).not.toContain(secret);
      expect(logs.join(" ")).toContain("[token]");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps going when one group fails and skips groups that are off", async () => {
    const seen: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runSlackAwardsForGroups({
        now: new Date("2026-10-07T17:00:00.000Z"),
        groups: [
          { id: "group-on", slack_awards_enabled: true, submit_end_day: 8 },
          { id: "group-off", slack_awards_enabled: false, submit_end_day: 8 },
          { id: "group-next", slack_awards_enabled: true, submit_end_day: 8 },
        ],
        generate: async (groupId) => {
          seen.push(groupId);
          if (groupId === "group-on") throw new Error("slack down");
        },
      });
    } finally {
      errorSpy.mockRestore();
    }
    expect(seen).toEqual(["group-on", "group-next"]);
  });

  it("omits the section when awards are disabled, hidden, or missing", async () => {
    const data = sampleAwards();
    expect(visibleSlackAwards({ enabled: false, hidden: false, data })).toBeNull();
    expect(visibleSlackAwards({ enabled: true, hidden: true, data })).toBeNull();
    expect(visibleSlackAwards({ enabled: true, hidden: false, data: null })).toBeNull();
    expect(renderSlackAwardsSectionHtml(null)).toBe("");
    expect(renderSlackAwardsSectionHtml(data)).toContain("Slack awards");
    expect(renderSlackAwardsSectionHtml(data)).toContain("Pip");

    const plain = buildCapsuleArchive({
      yearMonth: "2026-10",
      groupName: "Lantern Club",
      memberCount: 1,
      letters: [{ preferred_name: "Pip", body: "Hello.", photos: [] }],
    });
    expect(plain.html).not.toContain("Slack awards");
    expect(plain.slack_awards).toBeUndefined();

    const withAwards = buildCapsuleArchive({
      yearMonth: "2026-10",
      groupName: "Lantern Club",
      memberCount: 1,
      letters: [{ preferred_name: "Pip", body: "Hello.", photos: [] }],
      slackAwards: data,
    });
    expect(withAwards.html).toContain("Slack awards");
    expect(withAwards.html.indexOf("letter")).toBeLessThan(withAwards.html.indexOf("slack-awards"));
    expect(parseCapsuleArchive(withAwards)?.slack_awards?.senders[0]?.name).toBe("Pip");
    expect(parseCapsuleArchive({ ...plain, slack_awards: { nope: true } })?.slack_awards).toBeUndefined();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        loadVisibleSlackAwardsFrom({
          enabled: true,
          read: async () => {
            throw new Error("db down");
          },
        }),
      ).resolves.toBeUndefined();
      let reads = 0;
      await expect(
        loadVisibleSlackAwardsFrom({
          enabled: false,
          read: async () => {
            reads += 1;
            return null;
          },
        }),
      ).resolves.toBeUndefined();
      expect(reads).toBe(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("adds at most one PDF page and leaves the letter pages alone", () => {
    const letter = {
      templateId: "text-only",
      lines: [],
      photos: [],
    } as unknown as DocumentPlan["pages"][number];
    const plan: DocumentPlan = { pages: [letter] };
    const colors = {
      groupName: "Lantern Club",
      monthLabel: "September 2026",
      paper: "#fffdf7",
      ink: "#1a1712",
      accent: "#2f5b4c",
    };
    expect(appendSlackAwardsPage(plan, { ...colors, awards: null })).toBe(plan);
    const next = appendSlackAwardsPage(plan, { ...colors, awards: sampleAwards() });
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0]).toBe(letter);
    expect(next.pages[1]?.templateId).toBe("slack-awards");
    expect(next.pages[1]?.lines.some((line) => line.text.startsWith("Gold"))).toBe(true);
    expect(next.pages[1]?.lines.filter((line) => line.role === "footer")).toHaveLength(2);
  });
});

describe("slack web api", () => {
  it("waits for Retry-After on 429", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
          status: 429,
          headers: { "Retry-After": "2", "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, channels: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const payload = await slackApiCall({
      token: "fixture-token",
      method: "conversations.list",
      params: {},
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(payload.ok).toBe(true);
    expect(sleeps).toEqual([2000]);
    expect(calls).toBe(2);
  });

  it("pages member channels and calls replies only when reply_count is missing", async () => {
    const march = chicagoMonthUnixRange("2026-03")!;
    const inMonth = (march.start + 30).toFixed(6);
    const later = (march.start + 90).toFixed(6);
    const outside = (march.start - 5).toFixed(6);
    const calls: { method: string; params: URLSearchParams }[] = [];
    let lists = 0;

    const fetchImpl: typeof fetch = async (url, init) => {
      const method = String(url).split("/").pop() ?? "";
      const params = new URLSearchParams(String(init?.body ?? ""));
      calls.push({ method, params });
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

      if (method === "conversations.list") {
        lists += 1;
        if (lists === 1) {
          return json({
            ok: true,
            channels: [
              { id: "channel-lantern", name: "lantern-room", is_member: true },
              { id: "channel-kettle", name: "kettle-wharf", is_member: false },
            ],
            response_metadata: { next_cursor: "next-page" },
          });
        }
        return json({
          ok: true,
          channels: [{ id: "channel-stair", name: "north-stair", is_member: true }],
          response_metadata: { next_cursor: "" },
        });
      }
      if (method === "conversations.history") {
        if (params.get("channel") !== "channel-lantern") {
          return json({ ok: true, messages: [], response_metadata: { next_cursor: "" } });
        }
        return json({
          ok: true,
          messages: [
            {
              type: "message",
              user: "person-pip",
              text: "March begins.",
              ts: inMonth,
              reply_count: 4,
            },
            {
              type: "message",
              user: "person-pip",
              text: "Second note.",
              ts: later,
              reply_count: 0,
            },
            {
              type: "message",
              user: "person-nim",
              text: "Bring the mugs.",
              ts: (march.start + 10).toFixed(6),
              thread_ts: (march.start + 10).toFixed(6),
              reactions: [{ name: "star", count: 5 }],
            },
            {
              type: "message",
              user: "person-helper",
              text: "Automated ping.",
              ts: (march.start + 40).toFixed(6),
              reply_count: 12,
            },
            {
              type: "message",
              subtype: "channel_join",
              user: "person-join",
              text: "joined",
              ts: (march.start + 50).toFixed(6),
            },
            {
              type: "message",
              user: "person-pip",
              text: "Still February.",
              ts: outside,
              reply_count: 99,
            },
          ],
          response_metadata: { next_cursor: "" },
        });
      }
      if (method === "conversations.replies") {
        const parent = params.get("ts") ?? "";
        return json({
          ok: true,
          messages: [
            { type: "message", user: "person-nim", text: "Bring the mugs.", ts: parent },
            { type: "message", user: "person-pip", text: "On my way.", ts: (march.start + 12).toFixed(6) },
            { type: "message", user: "person-helper", bot_id: "bot-helper", text: "Noted.", ts: (march.start + 13).toFixed(6) },
          ],
          response_metadata: { next_cursor: "" },
        });
      }
      if (method === "users.info") {
        const user = params.get("user");
        if (user === "person-helper") {
          return json({ ok: true, user: { is_bot: true, profile: { display_name: "Helper" } } });
        }
        const name = user === "person-nim" ? "Nim" : "Pip";
        return json({ ok: true, user: { is_bot: false, profile: { display_name: name } } });
      }
      return json({ ok: false, error: "unknown_method" });
    };

    const awards = await collectSlackAwards({
      token: "fixture-token",
      writingMonth: "2026-03",
      fetchImpl,
      sleep: async () => undefined,
    });

    const methods = calls.map((call) => call.method);
    expect(methods.filter((method) => method === "conversations.replies")).toEqual(["conversations.replies"]);
    expect(calls.filter((call) => call.method === "conversations.history").map((call) => call.params.get("channel"))).toEqual([
      "channel-lantern",
      "channel-stair",
    ]);
    expect(calls.some((call) => call.params.get("channel") === "channel-kettle")).toBe(false);
    expect(calls.filter((call) => call.method === "conversations.list")[1]?.params.get("cursor")).toBe("next-page");
    const history = calls.find((call) => call.method === "conversations.history");
    expect(history?.params.get("oldest")).toBe(march.start.toFixed(6));
    expect(history?.params.get("latest")).toBe(march.end.toFixed(6));
    expect(awards.senders.map((sender) => `${sender.place}:${sender.name}:${sender.count}`)).toEqual([
      "gold:Pip:2",
      "silver:Nim:1",
    ]);
    expect(awards.mostReplies?.name).toBe("Pip");
    expect(awards.mostReplies?.replyCount).toBe(4);
    expect(awards.mostReactions).toMatchObject({ name: "Nim", reactionTotal: 5, topEmoji: "star" });
    expect(awards.channel?.name).toBe("lantern-room");
  });
});

describe("slack awards wiring", () => {
  it("keeps the manifest to the four bot scopes", () => {
    const manifest = readFileSync(resolve(here, "../../docs/slack-app-manifest.yml"), "utf8");
    expect(manifest).toContain("channels:read");
    expect(manifest).toContain("channels:history");
    expect(manifest).toContain("reactions:read");
    expect(manifest).toContain("users:read");
    expect(manifest).not.toMatch(/chat:write|channels:write|groups:|im:|mpim:|users:write|reactions:write/);
    expect(manifest).not.toMatch(/^\s*user:\s*$/m);
    const docs = readFileSync(resolve(here, "../../docs/slack-awards.md"), "utf8");
    expect(docs).toContain("SLACK_BOT_TOKEN");
    expect(docs).toContain("process.env.SLACK_BOT_TOKEN");
  });

  it("reads the bot token only from process.env.SLACK_BOT_TOKEN and does not log it", () => {
    const env = readFileSync(resolve(here, "./env.ts"), "utf8");
    expect(env).toContain("process.env.SLACK_BOT_TOKEN");
    const client = readFileSync(resolve(here, "./slack-client.ts"), "utf8");
    expect(client).not.toContain("process.env");
    expect(client).not.toContain("console.");
    expect(client).toContain("slackBotToken");
    const masked = maskSlackOpsDetail(new Error(`bad ${["xox", "b-another-fake"].join("")} and UABCDEFGH12`));
    expect(masked).not.toContain("another-fake");
    expect(masked).not.toContain("UABCDEFGH12");
    expect(masked).toContain("[token]");
    expect(masked).toContain("[id]");
  });

  it("runs awards after compile and email, and never overwrites owner edits in SQL", () => {
    const compileRoute = readFileSync(resolve(here, "../app/api/cron/compile/route.ts"), "utf8");
    expect(compileRoute.indexOf("compileDueCapsules")).toBeLessThan(compileRoute.indexOf("refreshDueSlackAwards"));
    expect(compileRoute).toContain("afterPrimaryWork");
    const emailRoute = readFileSync(resolve(here, "../app/api/cron/email/route.ts"), "utf8");
    expect(emailRoute.indexOf("sendDueCapsuleEmails")).toBeLessThan(emailRoute.indexOf("refreshDueSlackAwards"));
    expect(emailRoute).toContain('searchParams.get("dry") === "1"');
    expect(emailRoute).toContain("if (dryRun) return");
    const store = readFileSync(resolve(here, "./slack-awards-store.ts"), "utf8");
    expect(store).toContain('.eq("owner_edited", false)');
    expect(store).toContain("owner_edited: true");
    const job = readFileSync(resolve(here, "./slack-awards-job.ts"), "utf8");
    expect(job).toContain("slackHistoryYearMonth");
    expect(job).toContain("force: false");
    const compile = readFileSync(resolve(here, "./compile.ts"), "utf8");
    const snapshot = compile.slice(
      compile.indexOf("export async function snapshotMonthArchive"),
      compile.indexOf("async function writeCapsuleArchive"),
    );
    expect(snapshot.indexOf("includedSubmissions")).toBeLessThan(snapshot.indexOf("loadVisibleSlackAwards"));
    const migration = readFileSync(resolve(here, "../../supabase/migrations/20261124120000_slack_awards.sql"), "utf8");
    expect(migration).toContain("slack_awards_enabled boolean not null default false");
    expect(migration).toContain("group_slack_awards");
    expect(migration).not.toMatch(/alter table public\.(submissions|photos|capsules|months|letters)/);
    expect(migration).not.toMatch(/for insert/i);
    const settings = readFileSync(resolve(here, "../app/(app)/g/[uuid]/settings/page.tsx"), "utf8");
    expect(settings).toContain("requireOwner");
    expect(settings).toContain("SlackAwardsForm");
    const home = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    expect(home).not.toContain("SlackAwardsForm");
    const action = readFileSync(resolve(here, "../actions/slack-awards.ts"), "utf8");
    expect(action).toContain("requireOwnerUncached");
    expect(action).toContain("slackRefreshAllowed");
  });
});
