import { describe, expect, it } from "vitest";
import { layoutCapsuleDocument } from "./capsule-b2";
import { renderCapsuleHtml } from "./capsule-b2-html";

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
});
