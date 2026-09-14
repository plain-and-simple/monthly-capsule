import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "./copy";
import { passwordResetEmailHtml, passwordResetEmailSubject } from "./password-reset-email";

describe("password reset email", () => {
  it("uses Plain and Simple Monthly Capsule branding, not a bare Monthly Capsule", () => {
    const subject = passwordResetEmailSubject();
    expect(subject).toBe("Reset your Plain and Simple Monthly Capsule password");
    expect(subject).toContain(PRODUCT_NAME);
    expect(subject.startsWith("Reset your Monthly Capsule")).toBe(false);

    const html = passwordResetEmailHtml({
      preferredName: "Ada",
      link: "https://capsule.plainandsimple.app/reset/abc",
    });
    expect(html).toContain(PRODUCT_NAME);
    expect(html).toContain("Hi Ada");
    expect(html).toContain("https://capsule.plainandsimple.app/reset/abc");
    expect(html).toContain("Choose a new password");
    expect(html).toContain("works once and expires in an hour");
    expect(html).not.toMatch(/>Monthly Capsule</);
  });
});
