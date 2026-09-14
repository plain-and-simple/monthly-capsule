import { describe, expect, it } from "vitest";
import { capsuleEmailHtml, capsuleEmailSubject, capsuleEmailText } from "./capsule-email";

describe("capsule email", () => {
  it("uses the locked subject, not the group name", () => {
    expect(capsuleEmailSubject("Cedar Street", "September 2026")).toBe(
      "Your monthly capsule is ready",
    );
  });

  it("includes a plaintext read link for deliverability", () => {
    expect(
      capsuleEmailText({
        groupName: "Cedar Street",
        monthLabel: "September 2026",
        link: "https://capsule.plainandsimple.app/g/x/capsule/2026-09",
      }),
    ).toContain("Read the whole capsule: https://capsule.plainandsimple.app/g/x/capsule/2026-09");
  });

  it("includes submitted letters and a read link, never a late writer's name", () => {
    const html = capsuleEmailHtml({
      groupName: "Cedar Street",
      monthLabel: "September 2026",
      link: "https://capsule.plainandsimple.app/g/x/capsule/2026-09",
      letters: [{ name: "Wren", body: "The plum tree finally did something." }],
      nextOpen: "October 10",
    });
    expect(html).toContain("The plum tree finally did something.");
    expect(html).toContain("Read the whole capsule");
    expect(html).toContain("October 10");
    expect(html).not.toContain("Theo");
  });
});
