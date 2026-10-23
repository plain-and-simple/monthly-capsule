import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  B2_CONTENT_TOP,
  B2_HEADER_H,
  B2_PAGE_H,
  B2_PAGE_W,
  type DocumentPlan,
  type FontStyle,
  type PagePlan,
} from "@/lib/capsule-b2";
import { PDF_FONTS_DIR } from "@/lib/capsule-pdf-fonts";

const PX = 96 / 72;

function px(points: number): string {
  return (Math.round(points * PX * 100) / 100).toFixed(2);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontClass(style: FontStyle): string {
  if (style === "serifBold") return "ff-b";
  if (style === "serifItalic") return "ff-i";
  if (style === "sans") return "ff-s";
  return "ff-r";
}

function isEmojiCodePoint(code: number): boolean {
  if (code === 0x200d || code === 0x20e3) return true;
  if (code >= 0xfe00 && code <= 0xfe0f) return true;
  if (code === 0x00a9 || code === 0x00ae || code === 0x2122 || code === 0x2139) return true;
  if (code >= 0x2190 && code <= 0x21ff) return true;
  if (code >= 0x2300 && code <= 0x23ff) return true;
  if (code >= 0x2460 && code <= 0x24ff) return true;
  if (code >= 0x25a0 && code <= 0x27bf) return true;
  if (code >= 0x2b00 && code <= 0x2bff) return true;
  if (code === 0x3030 || code === 0x303d || code === 0x3297 || code === 0x3299) return true;
  if (code >= 0x1f000 && code <= 0x1faff) return true;
  return false;
}

function wrapLineHtml(text: string): string {
  let html = "";
  let buffer = "";
  let emoji = false;
  const flush = () => {
    if (!buffer) return;
    html += emoji ? `<span class="em">${esc(buffer)}</span>` : esc(buffer);
    buffer = "";
  };
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const next = isEmojiCodePoint(code);
    if (buffer && next !== emoji) flush();
    emoji = next;
    buffer += char;
  }
  flush();
  return html;
}

function fontFace(family: string, file: string, unicodeRange?: string): string {
  const href = pathToFileURL(join(PDF_FONTS_DIR, file)).href;
  const range = unicodeRange ? `unicode-range:${unicodeRange};` : "";
  return `@font-face{font-family:${family};src:url("${href}") format("truetype");font-weight:400;font-style:normal;${range}}`;
}

const EMOJI_UNICODE_RANGE = [
  "U+00A9",
  "U+00AE",
  "U+200D",
  "U+203C",
  "U+2049",
  "U+20E3",
  "U+2122",
  "U+2139",
  "U+2190-21FF",
  "U+2300-23FF",
  "U+2460-24FF",
  "U+25A0-27BF",
  "U+2B00-2BFF",
  "U+3030",
  "U+303D",
  "U+3297",
  "U+3299",
  "U+FE00-FE0F",
  "U+1F000-1FAFF",
].join(",");

export function renderCapsuleHtml(plan: DocumentPlan, images: ReadonlyMap<string, string>): string {
  const pages = plan.pages.map((page) => renderPage(page, images)).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>${pages}</body></html>`;
}

function css(): string {
  return [
    fontFace("CapsuleSerif", "LiberationSerif-Regular.ttf"),
    fontFace("CapsuleSerifBold", "LiberationSerif-Bold.ttf"),
    fontFace("CapsuleSerifItalic", "LiberationSerif-Italic.ttf"),
    fontFace("CapsuleSans", "LiberationSans-Regular.ttf"),
    fontFace("CapsuleEmoji", "Noto-COLRv1.ttf", EMOJI_UNICODE_RANGE),
    `@page{size:8.5in 11in;margin:0}`,
    `*{box-sizing:border-box}`,
    `html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `.page{position:relative;width:${px(B2_PAGE_W)}px;height:${px(B2_PAGE_H)}px;overflow:hidden;break-after:page;page-break-after:always}`,
    `.page:last-child{break-after:auto;page-break-after:auto}`,
    `.ln{position:absolute;white-space:pre;line-height:1;font-kerning:none;font-feature-settings:"kern" 0,"liga" 0;overflow:hidden}`,
    `.ff-r{font-family:CapsuleSerif,CapsuleEmoji,emoji,serif}`,
    `.ff-b{font-family:CapsuleSerifBold,CapsuleEmoji,emoji,serif}`,
    `.ff-i{font-family:CapsuleSerifItalic,CapsuleEmoji,emoji,serif}`,
    `.ff-s{font-family:CapsuleSans,CapsuleEmoji,emoji,sans-serif}`,
    `.em{font-family:CapsuleEmoji,emoji;font-variant-emoji:emoji}`,
    `.ph{position:absolute;overflow:hidden}`,
    `.ph img{width:100%;height:100%;display:block}`,
    `.band{position:absolute}`,
    `.rule{position:absolute}`,
  ].join("");
}

function renderPage(page: PagePlan, images: ReadonlyMap<string, string>): string {
  const parts: string[] = [
    `<div class="page" data-tpl="${esc(page.templateId)}" data-header="${page.headerStyle}" style="background:${page.paper};color:${page.ink}">`,
  ];
  for (const band of page.bands) {
    parts.push(
      `<div class="band" style="left:${px(band.x)}px;top:${px(band.y)}px;width:${px(band.w)}px;height:${px(band.h)}px;background:${band.fill}"></div>`,
    );
  }
  if (page.personName && page.headerStyle === "block") {
    parts.push(
      `<div class="band" style="left:0;top:${px(B2_CONTENT_TOP)}px;width:${px(B2_PAGE_W)}px;height:${px(B2_HEADER_H)}px;background:${page.headerFill}"></div>`,
    );
  }
  if (page.personName && page.headerStyle === "rule") {
    parts.push(
      `<div class="rule" style="left:${px(32)}px;top:${px(B2_CONTENT_TOP)}px;width:${px(B2_PAGE_W - 64)}px;height:${px(B2_HEADER_H)}px;border-top:2px solid ${page.ink};border-bottom:2px solid ${page.ink}"></div>`,
    );
  }
  if (page.personName && page.headerStyle === "serif") {
    const name = page.lines.find((line) => line.role === "name");
    const ruleW = 72;
    const ruleX = name ? name.x + Math.max(0, (name.w - ruleW) / 2) : 32;
    parts.push(
      `<div class="rule" style="left:${px(ruleX)}px;top:${px(B2_CONTENT_TOP + B2_HEADER_H - 2)}px;width:${px(ruleW)}px;height:2px;background:${page.accent}"></div>`,
    );
  }
  parts.push(
    `<div class="rule" style="left:${px(32)}px;top:${px(B2_PAGE_H - 30)}px;width:${px(B2_PAGE_W - 64)}px;border-top:1px solid ${page.ink}"></div>`,
  );
  for (const photo of page.photos) {
    const src = images.get(photo.storagePath);
    const fit = photo.fit === "contain" || photo.crop.letterbox ? "contain" : "cover";
    const pos = `${(photo.crop.posX * 100).toFixed(2)}% ${(photo.crop.posY * 100).toFixed(2)}%`;
    parts.push(
      `<div class="ph" style="left:${px(photo.x)}px;top:${px(photo.y)}px;width:${px(photo.w)}px;height:${px(photo.h)}px;background:${page.paper}">${
        src ? `<img alt="" src="${src}" style="object-fit:${fit};object-position:${pos}">` : ""
      }</div>`,
    );
  }
  for (const line of page.lines) {
    parts.push(
      `<div class="ln ${fontClass(line.font)}" style="left:${px(line.x)}px;top:${px(line.y)}px;width:${px(line.w)}px;height:${px(line.h)}px;font-size:${px(line.size)}px;line-height:${px(line.h)}px;color:${line.color}">${wrapLineHtml(line.text)}</div>`,
    );
  }
  parts.push("</div>");
  return parts.join("");
}
