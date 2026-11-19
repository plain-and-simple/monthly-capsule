import { describe, expect, it } from "vitest";
import {
  capsuleDeliveryHash,
  capsuleForceSendKey,
  capsuleSendKey,
  cycleSendKey,
  maskEmail,
} from "./email-send";

describe("email send helpers", () => {
  it("masks the mailbox and keeps the domain", () => {
    expect(maskEmail("ada@example.com")).toBe("a***@example.com");
    expect(maskEmail("  Jo@Example.com ")).toBe("J***@Example.com");
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });

  it("hashes the address and keeps send keys stable", () => {
    const hash = capsuleDeliveryHash("  Ada@Example.com ");
    expect(hash).toBe(capsuleDeliveryHash("ada@example.com"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const key = capsuleSendKey("cap-1", "Ada@Example.com");
    expect(key).toBe(`capsule-cap-1-${hash.slice(0, 32)}`);
    expect(capsuleForceSendKey("cap-1", "ada@example.com", "2026-11-19T15:00:00.000Z")).toBe(
      `${key}-force-2026-11-19T15:00:00.000Z`,
    );
    expect(
      cycleSendKey({
        kind: "open",
        groupId: "g1",
        yearMonth: "2026-11",
        memberId: "m1",
      }),
    ).toBe("cycle-open-g1-2026-11-m1");
  });
});
