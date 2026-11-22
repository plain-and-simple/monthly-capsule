import { describe, expect, it } from "vitest";
import { parseGroupName } from "./group-name";

describe("parseGroupName", () => {
  it("keeps a short name and trims surrounding space", () => {
    expect(parseGroupName("Kitchen")).toBe("Kitchen");
    expect(parseGroupName("  Kitchen  ")).toBe("Kitchen");
  });

  it("rejects empty and whitespace", () => {
    expect(parseGroupName("")).toEqual({ error: "Group name required." });
    expect(parseGroupName("   ")).toEqual({ error: "Group name required." });
  });

  it("accepts 40 characters and rejects 41", () => {
    expect(parseGroupName("a".repeat(40))).toBe("a".repeat(40));
    expect(parseGroupName(`  ${"a".repeat(40)}  `)).toBe("a".repeat(40));
    expect(parseGroupName("a".repeat(41))).toEqual({ error: "Name is too long." });
  });
});
