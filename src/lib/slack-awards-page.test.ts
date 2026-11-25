import { describe, expect, it } from "vitest";
import {
  B2_CONTENT_BOTTOM,
  B2_CONTENT_TOP,
  B2_INNER_W,
  B2_INNER_X,
  B2_MARGIN_X,
  B2_PAGE_W,
  type DocumentPlan,
} from "@/lib/capsule-b2";
import { renderCapsuleHtml } from "@/lib/capsule-b2-html";
import { slackShortcodesToUnicode } from "@/lib/slack-emoji";
import {
  appendSlackAwardsPage,
  createSlackAwardsPage,
} from "@/lib/slack-awards-page";
import {
  computeSlackAwards,
  emptySlackAwards,
  SLACK_AWARD_NAME_MAX,
  SLACK_AWARD_TEXT_MAX,
  type SlackAwardInputMessage,
  type SlackAwardsData,
} from "@/lib/slack-awards";

const colors = {
  groupName: "Lantern Club",
  monthLabel: "March 2026",
  paper: "#fffdf7",
  ink: "#1a1712",
  accent: "#2f5b4c",
};

function exactly(seed: string, length: number): string {
  const unit = `${seed} `;
  let text = "";
  while (text.length < length) text += unit;
  return text.slice(0, length);
}

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

describe("slack shortcodes on the awards page", () => {
  it("converts known shortcodes and drops custom ones", () => {
    expect(slackShortcodesToUnicode("Nice :upvote: from the stair")).toBe("Nice 👍 from the stair");
    expect(slackShortcodesToUnicode(":+1: and :sparkles: and :smile:")).toBe("👍 and ✨ and 😄");
    expect(slackShortcodesToUnicode("Bring mugs :lantern_owl: tonight")).toBe("Bring mugs tonight");
    expect(slackShortcodesToUnicode(":lantern_owl:.")).toBe(".");
    expect(slackShortcodesToUnicode("Meet at 3:00:00")).toBe("Meet at 3:00:00");
    expect(slackShortcodesToUnicode("A :upvote::skin-tone-3: for the kettle")).toBe("A 👍\u{1F3FC} for the kettle");

    const stored = computeSlackAwards([
      message({
        userId: "person-pip",
        ts: "10",
        text: "Nice :upvote: :lantern_owl: today",
        replyCount: 2,
      }),
    ]);
    expect(stored.mostReplies?.text).toBe("Nice :upvote: :lantern_owl: today");

    const plan: DocumentPlan = { pages: [] };
    const next = appendSlackAwardsPage(plan, {
      ...colors,
      awards: {
        senders: [],
        channel: null,
        mostReplies: {
          name: "Pip",
          channel: "lantern-room",
          replyCount: 2,
          text: "Nice :upvote: :lantern_owl: today",
        },
        mostReactions: null,
      },
    });
    const shown = next.pages[0]?.lines.map((line) => line.text).join("\n") ?? "";
    expect(shown).toContain("👍");
    expect(shown).not.toContain(":upvote:");
    expect(shown).not.toContain(":lantern_owl:");
    expect(shown).toContain("Nice 👍 today");
  });
});

describe("slack awards page", () => {
  it("skips the page when there is nothing to award", () => {
    const plan: DocumentPlan = { pages: [] };
    expect(appendSlackAwardsPage(plan, { ...colors, awards: null })).toBe(plan);
    expect(appendSlackAwardsPage(plan, { ...colors, awards: emptySlackAwards() })).toBe(plan);
  });

  it("fits one page when every quote is at the 200-character limit", () => {
    const reply = exactly("The north stair kettle hummed while Lark counted the spare mugs.", SLACK_AWARD_TEXT_MAX);
    const reaction = "M".repeat(SLACK_AWARD_TEXT_MAX);
    expect(reply).toHaveLength(SLACK_AWARD_TEXT_MAX);
    expect(reaction).toHaveLength(SLACK_AWARD_TEXT_MAX);

    const awards: SlackAwardsData = {
      senders: [
        { place: "gold", name: exactly("Pip of Lantern House", SLACK_AWARD_NAME_MAX), count: 42 },
        { place: "silver", name: exactly("Nim of Kettle Wharf", SLACK_AWARD_NAME_MAX), count: 17 },
        { place: "bronze", name: exactly("Lark of North Stair", SLACK_AWARD_NAME_MAX), count: 9 },
      ],
      channel: { name: exactly("north-stair-landing", SLACK_AWARD_NAME_MAX), count: 128 },
      mostReplies: {
        name: exactly("Nim of Kettle Wharf", SLACK_AWARD_NAME_MAX),
        channel: exactly("lantern-room", SLACK_AWARD_NAME_MAX),
        replyCount: 64,
        text: reply,
      },
      mostReactions: {
        name: exactly("Lark of North Stair", SLACK_AWARD_NAME_MAX),
        channel: exactly("kettle-wharf", SLACK_AWARD_NAME_MAX),
        reactionTotal: 31,
        topEmoji: "lantern_owl",
        text: reaction,
      },
    };

    const plan: DocumentPlan = { pages: [{ templateId: "text-only" } as DocumentPlan["pages"][number]] };
    const next = appendSlackAwardsPage(plan, { ...colors, awards });
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0]).toBe(plan.pages[0]);
    const page = next.pages[1]!;
    expect(page.templateId).toBe("slack-awards");
    expect(page.lines.filter((line) => line.role === "footer")).toHaveLength(2);

    const title = page.lines.find((line) => line.text === "Slack awards");
    const month = page.lines.find((line) => line.text === colors.monthLabel);
    expect(title?.font).toBe("serifBold");
    expect(title?.color).toBe(colors.accent);
    expect(month).toBeTruthy();
    expect(month!.y).toBeGreaterThan(title!.y);
    expect(month!.size).toBeLessThan(title!.size);

    const body = page.lines.filter((line) => line.role === "body").map((line) => line.text).join(" ");
    for (const place of ["Gold", "Silver", "Bronze"]) {
      expect(page.lines.some((line) => line.text === place)).toBe(true);
    }
    expect(body).toContain("🥇");
    expect(body).toContain("🥈");
    expect(body).toContain("🥉");
    expect(body).toContain("42 messages");
    expect(body).toContain("Most active channel");
    expect(body).toContain("128 messages");

    const repliesLabel = page.lines.find((line) => line.text === "Most replies")!;
    const reactionsLabel = page.lines.find((line) => line.text === "Most reactions")!;
    const replyLines = page.lines.filter(
      (line) => line.font === "serifItalic" && line.y > repliesLabel.y && line.y < reactionsLabel.y,
    );
    const reactionLines = page.lines.filter((line) => line.font === "serifItalic" && line.y > reactionsLabel.y);
    expect(replyLines.map((line) => line.text).join(" ")).toBe(reply);
    expect(reactionLines.map((line) => line.text).join("")).toBe(reaction);
    expect(replyLines.length).toBeGreaterThan(1);
    expect(reactionLines.length).toBeGreaterThan(1);

    const quoteRight = B2_INNER_X + B2_INNER_W;
    for (const line of [...replyLines, ...reactionLines]) {
      expect(line.x).toBeGreaterThan(B2_INNER_X);
      expect(line.x + line.w).toBeLessThanOrEqual(quoteRight + 0.5);
    }
    expect(page.lines.some((line) => line.text.includes("64 replies"))).toBe(true);
    expect(page.lines.some((line) => line.text.includes("31 reactions"))).toBe(true);
    expect(page.lines.some((line) => line.text.includes(":lantern_owl:"))).toBe(false);

    const bars = page.bands.filter((band) => band.fill === colors.accent && band.w <= 4 && band.h >= 12);
    expect(bars).toHaveLength(2);
    const cards = page.bands.filter((band) => band.w > 100 && band.h > 40);
    expect(cards).toHaveLength(3);

    let bottom = B2_CONTENT_TOP;
    for (const line of page.lines) {
      if (line.role === "footer") {
        expect(line.y).toBeGreaterThanOrEqual(B2_CONTENT_BOTTOM);
        continue;
      }
      expect(line.y).toBeGreaterThanOrEqual(B2_CONTENT_TOP - 0.5);
      expect(line.y + line.h).toBeLessThanOrEqual(B2_CONTENT_BOTTOM + 0.5);
      expect(line.x).toBeGreaterThanOrEqual(B2_MARGIN_X - 0.5);
      expect(line.x + line.w).toBeLessThanOrEqual(B2_PAGE_W - B2_MARGIN_X + 0.5);
      bottom = Math.max(bottom, line.y + line.h);
    }
    for (const band of page.bands) {
      expect(band.y).toBeGreaterThanOrEqual(B2_CONTENT_TOP - 0.5);
      expect(band.y + band.h).toBeLessThanOrEqual(B2_CONTENT_BOTTOM + 0.5);
      expect(band.x).toBeGreaterThanOrEqual(B2_MARGIN_X - 0.5);
      expect(band.x + band.w).toBeLessThanOrEqual(B2_PAGE_W - B2_MARGIN_X + 0.5);
    }
    expect(bottom).toBeLessThanOrEqual(B2_CONTENT_BOTTOM);

    const html = renderCapsuleHtml({ pages: [page] }, new Map());
    expect(html).toContain("🥇");
    expect(html).toContain('class="em"');
    expect(html).toContain("Noto-COLRv1.ttf");
  });

  it("draws medal circles when the emoji font has no medal glyph", () => {
    const page = createSlackAwardsPage({
      ...colors,
      pageNumber: 2,
      emojiGlyph: () => false,
      awards: {
        senders: [
          { place: "gold", name: "Pip", count: 4 },
          { place: "silver", name: "Nim", count: 3 },
          { place: "bronze", name: "Lark", count: 2 },
        ],
        channel: null,
        mostReplies: null,
        mostReactions: null,
      },
    });
    const text = page.lines.map((line) => line.text).join("");
    expect(text).not.toContain("🥇");
    expect(text).not.toContain("🥈");
    expect(text).not.toContain("🥉");
    const circles = page.bands.filter((band) => band.radius != null && band.w === band.h);
    expect(circles).toHaveLength(3);
    expect(circles.every((circle) => circle.radius === circle.w / 2 && circle.fill === colors.accent)).toBe(true);
    const html = renderCapsuleHtml({ pages: [page] }, new Map());
    expect(html).toContain("border-radius:");
    expect(html).not.toContain("🥇");
  });
});
