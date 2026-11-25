import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import {
  B2_CONTENT_BOTTOM,
  B2_CONTENT_TOP,
  B2_INNER_W,
  B2_INNER_X,
  B2_MARGIN_X,
  B2_PAGE_H,
  B2_PAGE_W,
  measureTextWidth,
  type DocumentPlan,
  type FontStyle,
  type PageBand,
  type PagePlan,
  type PlacedLine,
} from "@/lib/capsule-b2";
import { PDF_FONTS_DIR } from "@/lib/capsule-pdf-fonts";
import {
  SLACK_AWARDS_BRONZE,
  SLACK_AWARDS_CHANNEL,
  SLACK_AWARDS_GOLD,
  SLACK_AWARDS_REACTIONS,
  SLACK_AWARDS_REPLIES,
  SLACK_AWARDS_SECTION,
  SLACK_AWARDS_SILVER,
} from "@/lib/copy";
import { slackShortcodesToUnicode } from "@/lib/slack-emoji";
import {
  channelLabel,
  SLACK_AWARD_PLACES,
  type SlackAwardPlace,
  type SlackAwardsData,
  type SlackSenderAward,
} from "@/lib/slack-awards";

const MEDAL_EMOJI: Record<SlackAwardPlace, string> = {
  gold: "🥇",
  silver: "🥈",
  bronze: "🥉",
};

const MEDAL_CODE: Record<SlackAwardPlace, number> = {
  gold: 0x1f947,
  silver: 0x1f948,
  bronze: 0x1f949,
};

const PLACE_LABEL: Record<SlackAwardPlace, string> = {
  gold: SLACK_AWARDS_GOLD,
  silver: SLACK_AWARDS_SILVER,
  bronze: SLACK_AWARDS_BRONZE,
};

const TITLE_SIZE = 22;
const MONTH_SIZE = 11;
const PLACE_SIZE = 9;
const NAME_SIZE = 12;
const COUNT_SIZE = 10;
const CHANNEL_SIZE = 11;
const KICKER_SIZE = 10;
const BYLINE_SIZE = 9;
const CARD_GAP = 10;
const CARD_PAD = 12;
const STRIPE = 3;
const MEDAL_BOX = 28;
const CIRCLE = 20;
const BAR_W = 3;
const BAR_GAP = 8;
const QUOTE_SIZES = [13, 12, 11] as const;

type GlyphCheck = (code: number) => boolean;
type EmojiFace = { glyphForCodePoint(code: number): { id: number } };

let emojiFace: EmojiFace | undefined;

function notoEmojiHasGlyph(code: number): boolean {
  try {
    if (!emojiFace) {
      const create = (fontkit as unknown as { create: (bytes: Uint8Array) => EmojiFace }).create;
      emojiFace = create(new Uint8Array(readFileSync(`${PDF_FONTS_DIR}/Noto-COLRv1.ttf`)));
    }
    return emojiFace.glyphForCodePoint(code).id !== 0;
  } catch {
    return false;
  }
}

export function slackAwardsHaveContent(awards: SlackAwardsData): boolean {
  return (
    awards.senders.length > 0 ||
    awards.channel != null ||
    awards.mostReplies != null ||
    awards.mostReactions != null
  );
}

export function appendSlackAwardsPage(
  plan: DocumentPlan,
  input: {
    awards: SlackAwardsData | null;
    groupName: string;
    monthLabel: string;
    paper: string;
    ink: string;
    accent: string;
  },
): DocumentPlan {
  if (!input.awards || !slackAwardsHaveContent(input.awards)) return plan;
  const page = createSlackAwardsPage({
    ...input,
    awards: input.awards,
    pageNumber: plan.pages.length + 1,
  });
  return { pages: [...plan.pages, page] };
}

export function createSlackAwardsPage(input: {
  awards: SlackAwardsData;
  pageNumber: number;
  groupName: string;
  monthLabel: string;
  paper: string;
  ink: string;
  accent: string;
  emojiGlyph?: GlyphCheck;
}): PagePlan {
  const emojiGlyph = input.emojiGlyph ?? notoEmojiHasGlyph;
  let built = composePage(input, QUOTE_SIZES[0], emojiGlyph);
  for (const size of QUOTE_SIZES.slice(1)) {
    if (built.bottom <= B2_CONTENT_BOTTOM + 0.5) break;
    built = composePage(input, size, emojiGlyph);
  }
  built.lines.push(...placeFooter(input.pageNumber, input.groupName, input.monthLabel, input.ink));
  return {
    templateId: "slack-awards",
    headerStyle: "rule",
    personName: null,
    lines: built.lines,
    photos: [],
    bands: built.bands,
    paper: input.paper,
    ink: input.ink,
    accent: input.accent,
    headerFill: "transparent",
    headerInk: input.ink,
  };
}

type Draft = { lines: PlacedLine[]; bands: PageBand[]; bottom: number };

function composePage(
  input: {
    awards: SlackAwardsData;
    monthLabel: string;
    paper: string;
    ink: string;
    accent: string;
  },
  quoteSize: number,
  emojiGlyph: GlyphCheck,
): Draft {
  const lines: PlacedLine[] = [];
  const bands: PageBand[] = [];
  let y = B2_CONTENT_TOP;
  y = addLine(lines, SLACK_AWARDS_SECTION, B2_INNER_X, y, B2_INNER_W, TITLE_SIZE, "serifBold", input.accent, "left");
  y += 3;
  const month = input.monthLabel.trim();
  if (month) {
    y = addWrapped(lines, month, B2_INNER_X, y, B2_INNER_W, MONTH_SIZE, "sans", input.ink, "left");
    y += 16;
  } else {
    y += 12;
  }

  const senders = orderedSenders(input.awards);
  if (senders.length > 0) {
    y = placePodium(lines, bands, senders, y, input.paper, input.ink, input.accent, emojiGlyph);
    y += 18;
  }

  if (input.awards.channel) {
    const channel = channelLabel(slackShortcodesToUnicode(input.awards.channel.name));
    const text = joinBits([
      SLACK_AWARDS_CHANNEL,
      channel,
      countPhrase(input.awards.channel.count, "message", "messages"),
    ]);
    y = addWrapped(lines, text, B2_INNER_X, y, B2_INNER_W, CHANNEL_SIZE, "sans", input.ink, "left");
    y += 16;
  }

  if (input.awards.mostReplies) {
    const quote = input.awards.mostReplies;
    y = placeQuote(
      lines,
      bands,
      SLACK_AWARDS_REPLIES,
      slackShortcodesToUnicode(quote.text),
      joinBits([
        slackShortcodesToUnicode(quote.name),
        channelLabel(slackShortcodesToUnicode(quote.channel)),
        countPhrase(quote.replyCount, "reply", "replies"),
      ]),
      y,
      quoteSize,
      input.ink,
      input.accent,
    );
  }

  if (input.awards.mostReactions) {
    const quote = input.awards.mostReactions;
    placeQuote(
      lines,
      bands,
      SLACK_AWARDS_REACTIONS,
      slackShortcodesToUnicode(quote.text),
      joinBits([
        slackShortcodesToUnicode(quote.name),
        channelLabel(slackShortcodesToUnicode(quote.channel)),
        countPhrase(quote.reactionTotal, "reaction", "reactions"),
      ]),
      y,
      quoteSize,
      input.ink,
      input.accent,
    );
  }

  return { lines, bands, bottom: placedBottom(lines, bands) };
}

function placedBottom(lines: readonly PlacedLine[], bands: readonly PageBand[]): number {
  let bottom = B2_CONTENT_TOP;
  for (const line of lines) bottom = Math.max(bottom, line.y + line.h);
  for (const band of bands) bottom = Math.max(bottom, band.y + band.h);
  return bottom;
}

function orderedSenders(awards: SlackAwardsData): SlackSenderAward[] {
  return SLACK_AWARD_PLACES.flatMap((place) => {
    const sender = awards.senders.find((item) => item.place === place);
    return sender ? [sender] : [];
  });
}

function placePodium(
  lines: PlacedLine[],
  bands: PageBand[],
  senders: readonly SlackSenderAward[],
  y: number,
  paper: string,
  ink: string,
  accent: string,
  emojiGlyph: GlyphCheck,
): number {
  const cardW = (B2_INNER_W - CARD_GAP * 2) / 3;
  const innerW = cardW - CARD_PAD * 2;
  const names = senders.map((sender) =>
    wrapText(slackShortcodesToUnicode(sender.name), NAME_SIZE, "serifBold", innerW),
  );
  const maxNameLines = Math.max(0, ...names.map((wrapped) => wrapped.length));
  const nameH = lineHeight(NAME_SIZE);
  const placeH = lineHeight(PLACE_SIZE);
  const countH = lineHeight(COUNT_SIZE);
  const nameBlock = maxNameLines * nameH;
  const cardH =
    CARD_PAD +
    MEDAL_BOX +
    4 +
    placeH +
    (maxNameLines > 0 ? 4 + nameBlock : 0) +
    4 +
    countH +
    CARD_PAD;
  const rowW = senders.length * cardW + (senders.length - 1) * CARD_GAP;
  const rowX = B2_INNER_X + (B2_INNER_W - rowW) / 2;
  const fill = mixHex(paper, accent, 0.16);

  senders.forEach((sender, index) => {
    const x = rowX + index * (cardW + CARD_GAP);
    bands.push({ x, y, w: cardW, h: cardH, fill });
    bands.push({ x, y, w: cardW, h: STRIPE, fill: accent });
    const medalY = y + CARD_PAD;
    if (emojiGlyph(MEDAL_CODE[sender.place])) {
      addLine(lines, MEDAL_EMOJI[sender.place], x, medalY, cardW, 22, "serif", ink, "center");
    } else {
      const circleX = x + (cardW - CIRCLE) / 2;
      const circleY = medalY + (MEDAL_BOX - CIRCLE) / 2;
      bands.push({
        x: circleX,
        y: circleY,
        w: CIRCLE,
        h: CIRCLE,
        fill: accent,
        radius: CIRCLE / 2,
      });
    }
    let cursor = medalY + MEDAL_BOX + 4;
    cursor = addLine(lines, PLACE_LABEL[sender.place], x + CARD_PAD, cursor, innerW, PLACE_SIZE, "sans", accent, "center");
    cursor += 4;
    const nameLines = names[index] ?? [];
    for (const nameLine of nameLines) {
      addLine(lines, nameLine, x + CARD_PAD, cursor, innerW, NAME_SIZE, "serifBold", ink, "center");
      cursor += nameH;
    }
    const countY = y + cardH - CARD_PAD - countH;
    addLine(
      lines,
      countPhrase(sender.count, "message", "messages"),
      x + CARD_PAD,
      countY,
      innerW,
      COUNT_SIZE,
      "sans",
      ink,
      "center",
    );
  });

  return y + cardH;
}

function placeQuote(
  lines: PlacedLine[],
  bands: PageBand[],
  label: string,
  quote: string,
  byline: string,
  y: number,
  quoteSize: number,
  ink: string,
  accent: string,
): number {
  let cursor = addLine(lines, label, B2_INNER_X, y, B2_INNER_W, KICKER_SIZE, "sans", accent, "left");
  cursor += 6;
  const quoteX = B2_INNER_X + BAR_W + BAR_GAP;
  const quoteW = B2_INNER_W - BAR_W - BAR_GAP;
  const quoteLines = quote ? wrapText(quote, quoteSize, "serifItalic", quoteW) : [];
  if (quoteLines.length > 0) {
    const quoteH = quoteLines.length * lineHeight(quoteSize);
    bands.push({ x: B2_INNER_X, y: cursor, w: BAR_W, h: quoteH, fill: accent });
    for (const quoteLine of quoteLines) {
      addLine(lines, quoteLine, quoteX, cursor, quoteW, quoteSize, "serifItalic", ink, "left");
      cursor += lineHeight(quoteSize);
    }
    cursor += 4;
  }
  if (byline) {
    cursor = addWrapped(lines, byline, quoteX, cursor, quoteW, BYLINE_SIZE, "sans", ink, "left");
  }
  return cursor + 16;
}

function countPhrase(count: number, one: string, many: string): string {
  const value = Number.isFinite(count) ? count : 0;
  return `${value} ${value === 1 ? one : many}`;
}

function joinBits(parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" · ");
}

function lineHeight(size: number): number {
  return size * 1.3;
}

function addWrapped(
  lines: PlacedLine[],
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: FontStyle,
  color: string,
  align: "left" | "center",
): number {
  const wrapped = wrapText(text, size, font, maxWidth);
  let cursor = y;
  for (const line of wrapped) {
    addLine(lines, line, x, cursor, maxWidth, size, font, color, align);
    cursor += lineHeight(size);
  }
  return cursor;
}

function addLine(
  lines: PlacedLine[],
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: FontStyle,
  color: string,
  align: "left" | "center",
): number {
  const measured = measureTextWidth(text, size, font);
  const width = Math.max(1, Math.min(maxWidth, measured));
  const lineX = align === "center" ? x + Math.max(0, (maxWidth - width) / 2) : x;
  lines.push({
    text,
    x: lineX,
    y,
    w: width,
    h: lineHeight(size),
    size,
    font,
    color,
    role: "body",
  });
  return y + lineHeight(size);
}

function wrapText(text: string, size: number, font: FontStyle, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  const take = (word: string) => {
    if (measureTextWidth(word, size, font) <= maxWidth) {
      const next = current ? `${current} ${word}` : word;
      if (measureTextWidth(next, size, font) <= maxWidth) {
        current = next;
        return;
      }
      if (current) lines.push(current);
      current = word;
      return;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    const parts = splitWide(word, size, font, maxWidth);
    const last = parts.pop() ?? "";
    lines.push(...parts);
    current = last;
  };
  for (const word of words) take(word);
  if (current) lines.push(current);
  return lines;
}

function splitWide(word: string, size: number, font: FontStyle, maxWidth: number): string[] {
  const parts: string[] = [];
  let chunk = "";
  for (const ch of word) {
    const next = chunk + ch;
    if (!chunk || measureTextWidth(next, size, font) <= maxWidth) {
      chunk = next;
      continue;
    }
    parts.push(chunk);
    chunk = ch;
  }
  if (chunk) parts.push(chunk);
  return parts;
}

function mixHex(paper: string, accent: string, amount: number): string {
  const parse = (hex: string) => {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!match) return null;
    const value = match[1]!;
    return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  };
  const base = parse(paper);
  const tint = parse(accent);
  if (!base || !tint) return paper;
  const mixed = base.map((channel, index) =>
    Math.round(channel + (tint[index]! - channel) * amount),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function placeFooter(pageNumber: number, groupName: string, month: string, ink: string): PlacedLine[] {
  const y = B2_PAGE_H - 22;
  return [
    {
      text: `${groupName} · ${month}`,
      x: B2_MARGIN_X,
      y,
      w: B2_INNER_W * 0.78,
      h: 12,
      size: 9,
      font: "sans",
      color: ink,
      role: "footer",
    },
    {
      text: String(pageNumber),
      x: B2_PAGE_W - B2_MARGIN_X - 28,
      y,
      w: 28,
      h: 12,
      size: 9,
      font: "sans",
      color: ink,
      role: "footer",
    },
  ];
}
