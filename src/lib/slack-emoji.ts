import { SLACK_EMOJI_SHORTCODES } from "@/lib/slack-emoji-map";

/** A Slack :shortcode:, including :+1: and :skin-tone-2:. */
const SHORTCODE = /:([a-z0-9_+-]+):/gi;

/**
 * Replace known Slack shortcodes with Unicode.
 * A custom name with no mapping is removed. A numeric token that is not a
 * shortcode, such as the middle of 3:00:00, stays.
 */
export function slackShortcodesToUnicode(text: string): string {
  if (!text) return "";
  const converted = text.replace(SHORTCODE, (token, raw: string) => {
    const name = raw.toLowerCase();
    const emoji = SLACK_EMOJI_SHORTCODES[name];
    if (emoji) return emoji;
    if (/[a-z]/i.test(name)) return "";
    return token;
  });
  return converted
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .trim();
}
