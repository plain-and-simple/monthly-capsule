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
  type PagePlan,
  type PlacedLine,
} from "@/lib/capsule-b2";
import { SLACK_AWARDS_EMPTY, SLACK_AWARDS_SECTION } from "@/lib/copy";
import { slackAwardsLines, type SlackAwardsData } from "@/lib/slack-awards";

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
  if (!input.awards) return plan;
  const page = buildSlackAwardsPage({ ...input, awards: input.awards, pageNumber: plan.pages.length + 1 });
  return { pages: [...plan.pages, page] };
}

function buildSlackAwardsPage(input: {
  awards: SlackAwardsData;
  pageNumber: number;
  groupName: string;
  monthLabel: string;
  paper: string;
  ink: string;
  accent: string;
}): PagePlan {
  const body = slackAwardsLines(input.awards);
  const copy = body.length > 0 ? body : [SLACK_AWARDS_EMPTY];
  const lines: PlacedLine[] = [];
  let y = B2_CONTENT_TOP;
  y = pushWrapped(lines, SLACK_AWARDS_SECTION, y, 20, "serifBold", input.accent, 8);
  for (const line of copy) {
    y = pushWrapped(lines, line, y, 11, "serif", input.ink, 4);
    if (y > B2_CONTENT_BOTTOM) break;
  }
  lines.push(...placeFooter(input.pageNumber, input.groupName, input.monthLabel, input.ink));
  return {
    templateId: "slack-awards",
    headerStyle: "rule",
    personName: null,
    lines,
    photos: [],
    bands: [],
    paper: input.paper,
    ink: input.ink,
    accent: input.accent,
    headerFill: "transparent",
    headerInk: input.ink,
  };
}

function pushWrapped(
  lines: PlacedLine[],
  text: string,
  y: number,
  size: number,
  font: FontStyle,
  color: string,
  gapAfter: number,
): number {
  const height = size * 1.25;
  for (const line of wrapLine(text, size, font, B2_INNER_W)) {
    if (y + height > B2_CONTENT_BOTTOM) return y;
    const width = Math.min(B2_INNER_W, measureTextWidth(line, size, font));
    lines.push({
      text: line,
      x: B2_INNER_X,
      y,
      w: Math.max(width, 1),
      h: height,
      size,
      font,
      color,
      role: "body",
    });
    y += height;
  }
  return y + gapAfter;
}

function wrapLine(text: string, size: number, font: FontStyle, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measureTextWidth(next, size, font) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
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
