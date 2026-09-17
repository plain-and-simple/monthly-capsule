import { describe, expect, it } from "vitest";
import { copyTextToClipboard, copyTextWithExecCommand } from "./clipboard";

describe("clipboard copy", () => {
  it("returns false in Node when clipboard APIs are missing", async () => {
    expect(await copyTextToClipboard("hello")).toBe(false);
    expect(copyTextWithExecCommand("hello")).toBe(false);
  });
});
