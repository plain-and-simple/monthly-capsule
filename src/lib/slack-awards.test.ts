import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildCapsuleArchive, parseCapsuleArchive } from "@/lib/capsule-archive";
import type { DocumentPlan } from "@/lib/capsule-b2";
import { capsuleMonthLabel } from "@/lib/schedule";
import { appendSlackAwardsPage } from "@/lib/slack-awards-page";
import { collectSlackAwards, slackApiCall } from "@/lib/slack-client";
import {
  afterPrimaryWork,
  awardsForChicagoMonth,
  chicagoLocalToUtc,
  chicagoMonthUnixRange,
  computeSlackAwards,
  dispatchSlackAwardsCron,
  loadVisibleSlackAwardsFrom,
  maskSlackOpsDetail,
  parseSlackAwardsCronQuery,
  pullSlackAwardsDraft,
  renderSlackAwardsSectionHtml,
  runSlackAwardsForGroups,
  saveGeneratedSlackAwards,
  slackAwardsMonthLabel,
  slackAwardsStatsYearMonth,
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

  it("counts the 1st at 00:00 through the last day at 23:59:59", () => {
    const feb = chicagoMonthUnixRange("2026-02");
    const dec = chicagoMonthUnixRange("2025-12");
    expect(feb).not.toBeNull();
    expect(dec).not.toBeNull();
    expect(new Date(feb!.start * 1000).toISOString()).toBe("2026-02-01T06:00:00.000Z");
    expect(new Date(feb!.end * 1000).toISOString()).toBe("2026-03-01T05:59:59.000Z");
    expect(new Date(dec!.start * 1000).toISOString()).toBe("2025-12-01T06:00:00.000Z");
    expect(new Date(dec!.end * 1000).toISOString()).toBe("2026-01-01T05:59:59.000Z");

    const february = awardsForChicagoMonth(
      [
        message({
          userId: "person-otter",
          displayName: "Otter",
          ts: (feb!.start - 1).toFixed(6),
          replyCount: 9,
          text: "Still January.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: feb!.start.toFixed(6),
          text: "February begins.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: feb!.end.toFixed(6),
          text: "February ends.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: (feb!.end + 0.5).toFixed(6),
          text: "Last half-second.",
        }),
        message({
          userId: "person-lark",
          displayName: "Lark",
          ts: (feb!.end + 1).toFixed(6),
          replyCount: 7,
          text: "March begins.",
        }),
      ],
      "2026-02",
    );
    expect(february.senders).toEqual([{ place: "gold", name: "Pip", count: 3 }]);
    expect(february.mostReplies).toBeNull();

    const december = awardsForChicagoMonth(
      [
        message({
          userId: "person-otter",
          displayName: "Otter",
          ts: (dec!.start - 1).toFixed(6),
          replyCount: 4,
          text: "Still November.",
        }),
        message({
          userId: "person-nim",
          displayName: "Nim",
          ts: dec!.start.toFixed(6),
          text: "December begins.",
        }),
        message({
          userId: "person-nim",
          displayName: "Nim",
          ts: dec!.end.toFixed(6),
          text: "December ends.",
        }),
        message({
          userId: "person-lark",
          displayName: "Lark",
          ts: (dec!.end + 1).toFixed(6),
          replyCount: 8,
          text: "January begins.",
        }),
      ],
      "2025-12",
    );
    expect(december.senders).toEqual([{ place: "gold", name: "Nim", count: 2 }]);
    expect(december.mostReplies).toBeNull();
  });

  it("keeps March messages across the CST to CDT switch", () => {
    expect(chicagoLocalToUtc(2026, 3, 1, 0, 0, 0).toISOString()).toBe("2026-03-01T06:00:00.000Z");
    expect(chicagoLocalToUtc(2026, 3, 8, 1, 30, 0).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(chicagoLocalToUtc(2026, 3, 8, 3, 30, 0).toISOString()).toBe("2026-03-08T08:30:00.000Z");
    expect(chicagoLocalToUtc(2026, 3, 31, 23, 59, 59).toISOString()).toBe("2026-04-01T04:59:59.000Z");
    expect(chicagoLocalToUtc(2026, 4, 1, 0, 0, 0).toISOString()).toBe("2026-04-01T05:00:00.000Z");

    const march = chicagoMonthUnixRange("2026-03");
    expect(march).not.toBeNull();
    expect(new Date(march!.start * 1000).toISOString()).toBe("2026-03-01T06:00:00.000Z");
    expect(new Date(march!.end * 1000).toISOString()).toBe("2026-04-01T04:59:59.000Z");

    const awards = awardsForChicagoMonth(
      [
        message({
          userId: "person-otter",
          displayName: "Otter",
          ts: (march!.start - 1).toFixed(6),
          replyCount: 9,
          text: "Still February.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: march!.start.toFixed(6),
          text: "March begins.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: (chicagoLocalToUtc(2026, 3, 8, 1, 30, 0).getTime() / 1000).toFixed(6),
          text: "Before the clocks jump.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: (chicagoLocalToUtc(2026, 3, 8, 3, 30, 0).getTime() / 1000).toFixed(6),
          text: "After the clocks jump.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: march!.end.toFixed(6),
          text: "March ends.",
        }),
        message({
          userId: "person-pip",
          displayName: "Pip",
          ts: (march!.end + 0.5).toFixed(6),
          text: "Last half-second.",
        }),
        message({
          userId: "person-lark",
          displayName: "Lark",
          ts: (march!.end + 1).toFixed(6),
          replyCount: 7,
          text: "April begins.",
        }),
      ],
      "2026-03",
    );

    expect(awards.senders).toEqual([{ place: "gold", name: "Pip", count: 5 }]);
    expect(awards.mostReplies).toBeNull();
    expect(slackHistoryYearMonth("2026-10")).toBe("2026-09");
    expect(slackHistoryYearMonth("2026-01")).toBe("2025-12");
    expect(slackHistoryYearMonth("2026-04")).toBe("2026-03");
    expect(slackAwardsStatsYearMonth(new Date("2026-12-01T06:15:00.000Z"))).toBe("2026-11");
    expect(slackAwardsStatsYearMonth(new Date("2026-04-01T06:15:00.000Z"))).toBe("2026-03");
    expect(slackAwardsStatsYearMonth(new Date("2026-01-01T06:15:00.000Z"))).toBe("2025-12");
    expect(slackAwardsStatsYearMonth(new Date("2026-03-01T06:15:00.000Z"))).toBe("2026-02");
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

  it("does not overwrite a row the owner edited for the month the cron stores", async () => {
    const { state, gateway } = memory({
      data: next,
      owner_edited: true,
      hidden: true,
      generated_at: "2026-03-20T00:00:00.000Z",
    });
    const result = await saveGeneratedSlackAwards(gateway, {
      groupId: "group-lantern",
      yearMonth: "2026-03",
      data: { ...next, senders: [{ place: "gold", name: "Otter", count: 9 }] },
      nowIso: "2026-04-01T06:15:00.000Z",
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
        now: new Date("2026-04-01T06:15:00.000Z"),
        groups: [
          { id: "group-on", slack_awards_enabled: true },
          { id: "group-off", slack_awards_enabled: false },
          { id: "group-next", slack_awards_enabled: true },
        ],
        generate: async (groupId, yearMonth) => {
          seen.push(`${groupId}:${yearMonth}`);
          if (groupId === "group-on") throw new Error("slack down");
        },
      });
    } finally {
      errorSpy.mockRestore();
    }
    expect(seen).toEqual(["group-on:2026-03", "group-next:2026-03"]);
  });
});

const LANTERN_GROUP = "11111111-1111-4111-8111-111111111111";
const KETTLE_GROUP = "22222222-2222-4222-8222-222222222222";
const STAIR_GROUP = "33333333-3333-4333-8333-333333333333";

describe("slack awards cron query", () => {
  const cronNow = new Date("2026-06-01T05:15:00.000Z");

  it("stores an explicit year_month and counts that Chicago month", async () => {
    const seen: string[] = [];
    const summary = await runSlackAwardsForGroups({
      now: cronNow,
      yearMonth: "2026-03",
      groups: [
        { id: LANTERN_GROUP, slack_awards_enabled: true },
        { id: KETTLE_GROUP, slack_awards_enabled: false },
      ],
      generate: async (groupId, yearMonth) => {
        seen.push(`${groupId}:${yearMonth}`);
        return "saved";
      },
    });
    const march = chicagoMonthUnixRange("2026-03");
    expect(march).not.toBeNull();
    expect(new Date(march!.start * 1000).toISOString()).toBe("2026-03-01T06:00:00.000Z");
    expect(new Date(march!.end * 1000).toISOString()).toBe("2026-04-01T04:59:59.000Z");
    expect(seen).toEqual([`${LANTERN_GROUP}:2026-03`]);
    expect(summary).toEqual({
      year_month: "2026-03",
      results: [{ group_id: LANTERN_GROUP, status: "saved" }],
    });
    expect(slackAwardsStatsYearMonth(cronNow)).toBe("2026-05");
  });

  it("rejects an invalid year_month and does not call Slack", async () => {
    const run = vi.fn();
    for (const yearMonth of ["2026-13", "2026-00", "2026-3", "2026-03-01", "March", ""]) {
      const outcome = await dispatchSlackAwardsCron({
        yearMonth,
        groupId: null,
        now: cronNow,
        run,
      });
      expect(outcome.status).toBe(400);
      if (outcome.status === 400) expect(outcome.body.error).toBe("Invalid year_month.");
    }
    expect(run).not.toHaveBeenCalled();
    expect(parseSlackAwardsCronQuery({ yearMonth: "2026-03", groupId: null })).toEqual({
      ok: true,
      yearMonth: "2026-03",
      groupId: null,
    });
  });

  it("limits a run to one group and still runs it when awards are off", async () => {
    const disabled = { id: KETTLE_GROUP, slack_awards_enabled: false };
    const enabled = { id: LANTERN_GROUP, slack_awards_enabled: true };
    const seen: string[] = [];
    const summary = await runSlackAwardsForGroups({
      now: cronNow,
      yearMonth: "2026-03",
      groupId: KETTLE_GROUP.toUpperCase(),
      groups: [enabled, disabled, { id: STAIR_GROUP, slack_awards_enabled: true }],
      generate: async (groupId, yearMonth) => {
        seen.push(`${groupId}:${yearMonth}`);
        return "saved";
      },
    });
    expect(seen).toEqual([`${KETTLE_GROUP}:2026-03`]);
    expect(disabled.slack_awards_enabled).toBe(false);
    expect(enabled.slack_awards_enabled).toBe(true);
    expect(summary.results).toEqual([{ group_id: KETTLE_GROUP, status: "saved" }]);
  });

  it("rejects a bad group_id and does not call Slack", async () => {
    const run = vi.fn();
    const bogusGroupId = ["xox", "b-not-a-real-token"].join("");
    const outcome = await dispatchSlackAwardsCron({
      yearMonth: "2026-03",
      groupId: bogusGroupId,
      now: cronNow,
      run,
    });
    expect(outcome.status).toBe(400);
    expect(outcome.body).toEqual({ error: "Invalid group_id." });
    expect(JSON.stringify(outcome.body)).not.toContain(bogusGroupId);
    expect(run).not.toHaveBeenCalled();
    expect(
      parseSlackAwardsCronQuery({
        yearMonth: "2026-03",
        groupId: LANTERN_GROUP.toUpperCase(),
      }),
    ).toEqual({ ok: true, yearMonth: "2026-03", groupId: LANTERN_GROUP });
  });

  it("keeps the default to opted-in groups and the previous Chicago month", async () => {
    const off = { id: KETTLE_GROUP, slack_awards_enabled: false };
    const seen: string[] = [];
    const summary = await runSlackAwardsForGroups({
      now: new Date("2026-04-01T06:15:00.000Z"),
      groups: [
        { id: LANTERN_GROUP, slack_awards_enabled: true },
        off,
        { id: STAIR_GROUP, slack_awards_enabled: true },
      ],
      generate: async (groupId, yearMonth) => {
        seen.push(`${groupId}:${yearMonth}`);
        return "saved";
      },
    });
    expect(seen).toEqual([`${LANTERN_GROUP}:2026-03`, `${STAIR_GROUP}:2026-03`]);
    expect(off.slack_awards_enabled).toBe(false);
    expect(summary.year_month).toBe("2026-03");
    expect(summary.results.map((row) => row.group_id)).toEqual([LANTERN_GROUP, STAIR_GROUP]);
  });

  it("skips an owner-edited row on the cron path and does not call Slack", async () => {
    const collect = vi.fn(async () => sampleAwards());
    const writeGenerated = vi.fn(async () => "saved" as const);
    const writeForced = vi.fn(async () => undefined);
    const summary = await runSlackAwardsForGroups({
      now: new Date("2026-04-01T06:15:00.000Z"),
      groups: [{ id: LANTERN_GROUP, slack_awards_enabled: true }],
      generate: (groupId, yearMonth) =>
        pullSlackAwardsDraft({
          groupId,
          yearMonth,
          force: false,
          read: async () => ({
            data: sampleAwards(),
            owner_edited: true,
            hidden: true,
            generated_at: "2026-03-20T00:00:00.000Z",
          }),
          collect,
          writeGenerated,
          writeForced,
        }),
    });
    expect(collect).not.toHaveBeenCalled();
    expect(writeGenerated).not.toHaveBeenCalled();
    expect(writeForced).not.toHaveBeenCalled();
    expect(summary).toEqual({
      year_month: "2026-03",
      results: [{ group_id: LANTERN_GROUP, status: "skipped" }],
    });
  });

  it("still lets an owner refresh replace an edited row", async () => {
    const collect = vi.fn(async () => sampleAwards());
    const result = await pullSlackAwardsDraft({
      groupId: LANTERN_GROUP,
      yearMonth: "2026-03",
      force: true,
      read: async () => ({
        data: sampleAwards(),
        owner_edited: true,
        hidden: false,
        generated_at: "2026-03-20T00:00:00.000Z",
      }),
      collect,
      writeGenerated: async () => {
        throw new Error("cron write");
      },
      writeForced: async () => undefined,
    });
    expect(result).toBe("saved");
    expect(collect).toHaveBeenCalledWith("2026-03");
  });

  it("returns 200 when Slack fails and keeps the token out of the summary", async () => {
    const secret = ["xox", "b-not-a-real-token"].join("");
    const logs: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const summary = await runSlackAwardsForGroups({
        now: new Date("2026-04-01T06:15:00.000Z"),
        groups: [{ id: LANTERN_GROUP, slack_awards_enabled: true }],
        generate: async () => {
          throw new Error(`rejected ${secret} for Pip in lantern-room`);
        },
      });
      const outcome = await dispatchSlackAwardsCron({
        yearMonth: null,
        groupId: null,
        now: new Date("2026-04-01T06:15:00.000Z"),
        run: async () => summary,
      });
      const body = JSON.stringify(outcome.body);
      expect(outcome.status).toBe(200);
      expect(body).not.toContain(secret);
      expect(body).not.toContain("Pip");
      expect(body).not.toContain("lantern");
      expect(body).toContain("failed");
      expect(logs.join(" ")).toContain("[token]");
      expect(logs.join(" ")).not.toContain(secret);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("labels the settings draft with the awards month", () => {
    expect(slackAwardsMonthLabel("2026-03")).toBe("March 2026");
    expect(slackAwardsMonthLabel("2026-01")).toBe("January 2026");
    expect(capsuleMonthLabel("2026-03")).toBe("February 2026");
    const settings = readFileSync(resolve(here, "../app/(app)/g/[uuid]/settings/page.tsx"), "utf8");
    expect(settings).toContain("monthLabel={slackAwardsMonthLabel(awardsYearMonth)}");
    expect(settings).not.toContain("capsuleMonthLabel(draftCycle)");
    const form = readFileSync(resolve(here, "../components/slack-awards-form.tsx"), "utf8");
    expect(form).toContain("SLACK_AWARDS_REFRESH");
    expect(form).toContain("refreshSlackAwards");
  });
});

describe("slack awards section", () => {
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
      if (method === "conversations.join") {
        return json({ ok: true, channel: { id: params.get("channel") } });
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
    expect(calls.filter((call) => call.method === "conversations.join").map((call) => call.params.get("channel"))).toEqual([
      "channel-kettle",
    ]);
    expect(methods.lastIndexOf("conversations.list")).toBeLessThan(methods.indexOf("conversations.join"));
    expect(methods.indexOf("conversations.join")).toBeLessThan(methods.indexOf("conversations.history"));
    expect(calls.filter((call) => call.method === "conversations.history").map((call) => call.params.get("channel"))).toEqual([
      "channel-lantern",
      "channel-kettle",
      "channel-stair",
    ]);
    expect(calls.filter((call) => call.method === "conversations.list")[1]?.params.get("cursor")).toBe("next-page");
    const history = calls.find((call) => call.method === "conversations.history");
    expect(history?.params.get("oldest")).toBe(march.start.toFixed(6));
    expect(history?.params.get("latest")).toBe((march.end + 1).toFixed(6));
    expect(awards.senders.map((sender) => `${sender.place}:${sender.name}:${sender.count}`)).toEqual([
      "gold:Pip:2",
      "silver:Nim:1",
    ]);
    expect(awards.mostReplies?.name).toBe("Pip");
    expect(awards.mostReplies?.replyCount).toBe(4);
    expect(awards.mostReactions).toMatchObject({ name: "Nim", reactionTotal: 5, topEmoji: "star" });
    expect(awards.channel?.name).toBe("lantern-room");
  });

  it("joins only public non-archived channels the bot is missing from", async () => {
    const march = chicagoMonthUnixRange("2026-03")!;
    const lanternTs = (march.start + 10).toFixed(6);
    const kettleTs = (march.start + 40).toFixed(6);
    const calls: { method: string; params: URLSearchParams }[] = [];

    const fetchImpl: typeof fetch = async (url, init) => {
      const method = String(url).split("/").pop() ?? "";
      const params = new URLSearchParams(String(init?.body ?? ""));
      calls.push({ method, params });
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

      if (method === "conversations.list") {
        expect(params.get("types")).toBe("public_channel");
        expect(params.get("exclude_archived")).toBe("true");
        return json({
          ok: true,
          channels: [
            { id: "channel-lantern", name: "lantern-room", is_member: true, is_channel: true, is_private: false, is_archived: false },
            { id: "channel-kettle", name: "kettle-wharf", is_member: false, is_channel: true, is_private: false, is_archived: false },
            { id: "channel-attic", name: "attic-loft", is_member: true, is_channel: true, is_archived: true },
            { id: "channel-vault", name: "vault-parlor", is_member: true, is_private: true, is_group: true },
            { id: "channel-note", name: "note-slip", is_member: false, is_im: true },
            { id: "channel-huddle", name: "huddle-nook", is_member: false, is_mpim: true },
            { id: "channel-back", name: "back-room", is_member: false, is_channel: false },
            { id: "channel-locked", name: "locked-gate", is_member: false, is_channel: true, is_private: false, is_archived: false },
          ],
          response_metadata: { next_cursor: "" },
        });
      }
      if (method === "conversations.join") {
        if (params.get("channel") === "channel-locked") {
          return json({ ok: false, error: "restricted_action" });
        }
        return json({ ok: true, channel: { id: params.get("channel") } });
      }
      if (method === "conversations.history") {
        const channel = params.get("channel");
        if (channel === "channel-lantern") {
          return json({
            ok: true,
            messages: [{ type: "message", user: "person-pip", text: "The lantern is lit.", ts: lanternTs, reply_count: 0 }],
            response_metadata: { next_cursor: "" },
          });
        }
        if (channel === "channel-kettle") {
          return json({
            ok: true,
            messages: [{ type: "message", user: "person-nim", text: "The kettle sings.", ts: kettleTs, reply_count: 0 }],
            response_metadata: { next_cursor: "" },
          });
        }
        return json({ ok: true, messages: [], response_metadata: { next_cursor: "" } });
      }
      if (method === "users.info") {
        const user = params.get("user");
        const name = user === "person-nim" ? "Nim" : "Pip";
        return json({ ok: true, user: { is_bot: false, profile: { display_name: name } } });
      }
      return json({ ok: false, error: "unknown_method" });
    };

    let awards: SlackAwardsData | null = null;
    const compiled = await afterPrimaryWork(
      async () => ["compiled"],
      async () => {
        awards = await collectSlackAwards({
          token: "fixture-token",
          writingMonth: "2026-03",
          fetchImpl,
          sleep: async () => undefined,
        });
      },
    );

    expect(compiled).toEqual(["compiled"]);
    expect(awards).not.toBeNull();
    const joined = calls.filter((call) => call.method === "conversations.join").map((call) => call.params.get("channel"));
    expect(joined).toEqual(["channel-kettle", "channel-locked"]);
    const history = calls.filter((call) => call.method === "conversations.history").map((call) => call.params.get("channel"));
    expect(history).toEqual(["channel-lantern", "channel-kettle"]);
    expect(awards!.senders.map((sender) => sender.name)).toEqual(["Pip", "Nim"]);
    expect(awards!.channel).toEqual({ name: "lantern-room", count: 1 });
    const methods = calls.map((call) => call.method);
    expect(methods.lastIndexOf("conversations.list")).toBeLessThan(methods.indexOf("conversations.join"));
    expect(methods.lastIndexOf("conversations.join")).toBeLessThan(methods.indexOf("conversations.history"));
  });
});

describe("slack awards wiring", () => {
  it("keeps the manifest to the listed bot scopes", () => {
    const manifest = readFileSync(resolve(here, "../../docs/slack-app-manifest.yml"), "utf8");
    const scopes = [...manifest.matchAll(/^\s+- ([a-z:]+)$/gm)].map((match) => match[1]);
    expect(scopes).toEqual([
      "channels:read",
      "channels:history",
      "channels:join",
      "reactions:read",
      "users:read",
    ]);
    expect(manifest).not.toMatch(/chat:write|channels:write|groups:|im:|mpim:|users:write|reactions:write/);
    expect(manifest).not.toMatch(/^\s*user:\s*$/m);
    const docs = readFileSync(resolve(here, "../../docs/slack-awards.md"), "utf8");
    expect(docs).toContain("SLACK_BOT_TOKEN");
    expect(docs).toContain("process.env.SLACK_BOT_TOKEN");
    expect(docs).toContain("No `/invite` is needed");
    expect(docs).toContain("joins public, non-archived channels");
    expect(docs).toContain("Private channels remain out of scope");
    expect(docs).not.toContain("Invite the app");
    expect(docs).toContain("15 6 1 * *");
    expect(docs).toContain("/api/cron/slack-awards");
    expect(docs).toContain("23:59:59");
    expect(docs).toContain("year_month");
    expect(docs).toContain("group_id");
    expect(docs).toContain("2026-03");
    expect(docs).toContain("11111111-1111-4111-8111-111111111111");
    expect(docs).toContain("400");
    expect(docs).toContain("Refresh from Slack");
    expect(docs).not.toContain("day before");
    const readme = readFileSync(resolve(here, "../../README.md"), "utf8");
    expect(readme).toContain("year_month=2026-03");
    expect(readme).toContain("group_id=11111111-1111-4111-8111-111111111111");
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

  it("schedules awards on the monthly cron and never overwrites owner edits in SQL", () => {
    const compileRoute = readFileSync(resolve(here, "../app/api/cron/compile/route.ts"), "utf8");
    expect(compileRoute).toContain("compileDueCapsules");
    expect(compileRoute).not.toContain("slack");
    expect(compileRoute).not.toContain("afterPrimaryWork");
    const emailRoute = readFileSync(resolve(here, "../app/api/cron/email/route.ts"), "utf8");
    expect(emailRoute).toContain("sendDueCapsuleEmails");
    expect(emailRoute).toContain('searchParams.get("dry") === "1"');
    expect(emailRoute).not.toContain("slack");
    expect(emailRoute).not.toContain("afterPrimaryWork");
    const slackRoute = readFileSync(resolve(here, "../app/api/cron/slack-awards/route.ts"), "utf8");
    const handler = slackRoute.slice(slackRoute.indexOf("export async function GET"));
    expect(handler.indexOf("authorizeCron")).toBeLessThan(handler.indexOf("dispatchSlackAwardsCron"));
    expect(handler.indexOf("dispatchSlackAwardsCron")).toBeLessThan(handler.indexOf("refreshMonthlySlackAwards"));
    expect(handler).toContain("status: outcome.status");
    const vercel = readFileSync(resolve(here, "../../vercel.json"), "utf8");
    expect(vercel).toContain('"/api/cron/slack-awards"');
    expect(vercel).toContain('"15 6 1 * *"');
    const store = readFileSync(resolve(here, "./slack-awards-store.ts"), "utf8");
    expect(store).toContain('.eq("owner_edited", false)');
    expect(store).toContain("owner_edited: true");
    const job = readFileSync(resolve(here, "./slack-awards-job.ts"), "utf8");
    expect(job).toContain("pullSlackAwardsDraft");
    expect(job).toContain("force: false");
    expect(job).not.toContain("setSlackAwardsEnabled");
    expect(job).not.toContain("slack_awards_enabled: true");
    expect(job).not.toContain("slackHistoryYearMonth");
    expect(job).toContain("writingMonth: yearMonth");
    const awards = readFileSync(resolve(here, "./slack-awards.ts"), "utf8");
    expect(awards).toContain("existing?.owner_edited && !input.force");
    const compile = readFileSync(resolve(here, "./compile.ts"), "utf8");
    const snapshot = compile.slice(
      compile.indexOf("export async function snapshotMonthArchive"),
      compile.indexOf("async function writeCapsuleArchive"),
    );
    expect(snapshot.indexOf("includedSubmissions")).toBeLessThan(snapshot.indexOf("loadVisibleSlackAwards"));
    expect(snapshot).toContain("slackHistoryYearMonth(yearMonth)");
    const migration = readFileSync(resolve(here, "../../supabase/migrations/20261124120000_slack_awards.sql"), "utf8");
    expect(migration).toContain("slack_awards_enabled boolean not null default false");
    expect(migration).toContain("group_slack_awards");
    expect(migration).toContain("Capsule cycle key (YYYY-MM)");
    expect(migration).not.toContain("23:59:59");
    expect(migration).not.toMatch(/alter table public\.(submissions|photos|capsules|months|letters)/);
    expect(migration).not.toMatch(/for insert/i);
    const settings = readFileSync(resolve(here, "../app/(app)/g/[uuid]/settings/page.tsx"), "utf8");
    expect(settings).toContain("requireOwner");
    expect(settings).toContain("SlackAwardsForm");
    expect(settings).toContain("slackHistoryYearMonth");
    expect(settings).toContain("slackAwardsMonthLabel(awardsYearMonth)");
    const home = readFileSync(resolve(here, "../app/(app)/g/[uuid]/page.tsx"), "utf8");
    expect(home).not.toContain("SlackAwardsForm");
    const action = readFileSync(resolve(here, "../actions/slack-awards.ts"), "utf8");
    expect(action).toContain("requireOwnerUncached");
    expect(action).toContain("slackRefreshAllowed");
    expect(action).toContain("slackHistoryYearMonth");
  });
});
