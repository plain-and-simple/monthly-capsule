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

function fontFamily(style: FontStyle): string {
  if (style === "serifBold") return '"CapsuleSerifBold","CapsuleEmoji",serif';
  if (style === "serifItalic") return '"CapsuleSerifItalic","CapsuleEmoji",serif';
  if (style === "sans") return '"CapsuleSans","CapsuleEmoji",sans-serif';
  return '"CapsuleSerif","CapsuleEmoji",serif';
}

function fontFace(family: string, file: string): string {
  const href = pathToFileURL(join(PDF_FONTS_DIR, file)).href;
  return `@font-face{font-family:"${family}";src:url("${href}") format("truetype");font-weight:400;font-style:normal;}`;
}

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
    fontFace("CapsuleEmoji", "NotoEmoji-Variable.ttf"),
    `@page{size:8.5in 11in;margin:0}`,
    `*{box-sizing:border-box}`,
    `html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `.page{position:relative;width:${px(B2_PAGE_W)}px;height:${px(B2_PAGE_H)}px;overflow:hidden;break-after:page;page-break-after:always}`,
    `.page:last-child{break-after:auto;page-break-after:auto}`,
    `.ln{position:absolute;white-space:pre;line-height:1;font-kerning:none;font-feature-settings:"kern" 0,"liga" 0;overflow:hidden}`,
    `.ph{position:absolute;overflow:hidden}`,
    `.ph img{width:100%;height:100%;display:block}`,
  ].join("");
}

function renderPage(page: PagePlan, images: ReadonlyMap<string, string>): string {
  const parts: string[] = [
    `<div class="page" data-tpl="${esc(page.templateId)}" data-header="${page.headerStyle}" style="background:${page.paper};color:${page.ink}">`,
  ];
  if (page.personName && page.headerStyle === "block") {
    parts.push(
      `<div style="position:absolute;left:0;top:${px(B2_CONTENT_TOP)}px;width:${px(B2_PAGE_W)}px;height:${px(B2_HEADER_H)}px;background:${page.headerFill}"></div>`,
    );
  }
  if (page.personName && page.headerStyle === "rule") {
    parts.push(
      `<div style="position:absolute;left:${px(32)}px;top:${px(B2_CONTENT_TOP)}px;width:${px(B2_PAGE_W - 64)}px;height:${px(B2_HEADER_H)}px;border-top:2px solid ${page.ink};border-bottom:2px solid ${page.ink}"></div>`,
    );
  }
  if (page.personName && page.headerStyle === "serif") {
    parts.push(
      `<div style="position:absolute;left:${px(32)}px;top:${px(B2_CONTENT_TOP + B2_HEADER_H - 2)}px;width:${px(72)}px;height:2px;background:${page.accent}"></div>`,
    );
  }
  parts.push(
    `<div style="position:absolute;left:${px(32)}px;top:${px(B2_PAGE_H - 30)}px;width:${px(B2_PAGE_W - 64)}px;border-top:1px solid ${page.ink}"></div>`,
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
      `<div class="ln" style="left:${px(line.x)}px;top:${px(line.y)}px;width:${px(line.w)}px;height:${px(line.h)}px;font-size:${px(line.size)}px;line-height:${px(line.h)}px;font-family:${fontFamily(line.font)};color:${line.color}">${esc(line.text)}</div>`,
    );
  }
  parts.push("</div>");
  return parts.join("");
}
