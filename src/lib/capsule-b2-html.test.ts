import { describe, expect, it } from "vitest";
import { layoutCapsuleDocument } from "./capsule-b2";
import { capsulePhotoKey, renderCapsuleHtml, type CapsuleHtmlImage } from "./capsule-b2-html";

function layoutWithEmoji() {
  return layoutCapsuleDocument({
    groupName: "Cedar Street",
    monthLabel: "October 2026",
    theme: "classic",
    missedLine: "",
    contributors: "",
    letters: [
      {
        preferredName: "Wren",
        body: "The plum tree finally did something this year. Hello 🎉",
        photos: [],
      },
    ],
  });
}

describe("b2 html fonts", () => {
  it("never puts an unescaped double quote inside a style attribute", () => {
    const html = renderCapsuleHtml(layoutWithEmoji(), new Map());
    const attrs = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((match) => match[1]!);
    expect(attrs.length).toBeGreaterThan(8);
    for (const value of attrs) {
      expect(value).not.toContain('"');
      expect(value).not.toContain("font-family:");
    }
    expect(html).toContain("font-family:CapsuleSerif,CapsuleEmoji,emoji,serif");
    expect(html).toContain("font-family:CapsuleSerifBold,CapsuleEmoji,emoji,serif");
    expect(html).toContain("font-family:CapsuleSerifItalic,CapsuleEmoji,emoji,serif");
    expect(html).toContain("font-family:CapsuleSans,CapsuleEmoji,emoji,sans-serif");
    expect(html).toContain("Noto-COLRv1.ttf");
    expect(html).toContain('class="em"');
    expect(html).toContain("🎉");
  });

  it("keeps cream name color on a block header after quoting is fixed", () => {
    const plan = layoutCapsuleDocument({
      groupName: "Cedar Street",
      monthLabel: "October 2026",
      theme: "classic",
      missedLine: "",
      contributors: "",
      letters: [
        { preferredName: "Ada", body: "A short note about the porch light.", photos: [] },
        { preferredName: "Bea", body: "Another short note about the porch light.", photos: [] },
      ],
    });
    const block = plan.pages.find((page) => page.headerStyle === "block")!;
    const name = block.lines.find((line) => line.role === "name")!;
    const html = renderCapsuleHtml(plan, new Map());
    expect(html).toContain(`color:${name.color}`);
    expect(name.color).toBe("#fffdf7");
    expect(html).toContain(`background:${block.headerFill}`);
    expect(html).not.toContain("Noto-COLRv1");
    expect(html).not.toContain("CapsuleEmoji");
  });

  it("centres the serif accent under the name", () => {
    const plan = layoutCapsuleDocument({
      groupName: "Cedar Street",
      monthLabel: "October 2026",
      theme: "classic",
      missedLine: "",
      contributors: "",
      letters: [
        { preferredName: "Ada", body: "First letter sits on the rule header.", photos: [] },
        { preferredName: "Bea", body: "Second letter sits on the block header.", photos: [] },
        { preferredName: "Cyd", body: "Third letter sits on the serif header.", photos: [] },
      ],
    });
    const serif = plan.pages.find((page) => page.headerStyle === "serif")!;
    const name = serif.lines.find((line) => line.role === "name")!;
    const html = renderCapsuleHtml(plan, new Map());
    const px = 96 / 72;
    const ruleW = (72 * px).toFixed(2);
    const ruleX = ((name.x + Math.max(0, (name.w - 72) / 2)) * px).toFixed(2);
    expect(html).toContain(`left:${ruleX}px`);
    expect(html).toContain(`width:${ruleW}px`);
    expect(html).toContain(`background:${serif.accent}`);
  });

  it("places each photo at its slot with no CSS crop or scale", () => {
    const plan = layoutCapsuleDocument({
      groupName: "Fixture Group",
      monthLabel: "October 2026",
      theme: "classic",
      missedLine: "",
      contributors: "",
      letters: [
        {
          preferredName: "Member One",
          body: "A short synthetic note about the porch light.",
          photos: [{ storagePath: "fixture/one.jpg", width: 1400, height: 900, faces: [], order: 0 }],
        },
      ],
    });
    const images = new Map<string, CapsuleHtmlImage>();
    const px = (points: number) => (Math.round(points * (96 / 72) * 100) / 100).toFixed(2);
    plan.pages.forEach((page, pageIndex) => {
      page.photos.forEach((_photo, photoIndex) => {
        images.set(capsulePhotoKey(pageIndex, photoIndex), {
          src: "data:image/jpeg;base64,QQ==",
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        });
      });
    });
    const html = renderCapsuleHtml(plan, images);
    expect(html).not.toContain("object-fit");
    expect(html).not.toContain("object-position");
    const slots = plan.pages.flatMap((page) => page.photos);
    expect(slots.length).toBeGreaterThan(0);
    for (const photo of slots) {
      expect(html).toContain(`left:${px(photo.x)}px`);
      expect(html).toContain(`top:${px(photo.y)}px`);
      expect(html).toContain(`width:${px(photo.w)}px`);
      expect(html).toContain(`height:${px(photo.h)}px`);
    }
    expect(html).toContain("width:100.00%");
    expect(html).toContain("height:100.00%");
  });
});
