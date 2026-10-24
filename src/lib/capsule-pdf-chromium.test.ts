import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chromiumCacheCandidates, findCachedChromiumBinary } from "./capsule-pdf-chromium";

describe("chromium binary cache", () => {
  it("reuses a binary already unpacked in tmp and ignores an empty file", () => {
    const dir = mkdtempSync(join(tmpdir(), "capsule-chromium-cache-"));
    try {
      const empty = join(dir, "empty");
      const binary = join(dir, "chromium");
      writeFileSync(empty, Buffer.alloc(0));
      expect(findCachedChromiumBinary([empty, binary])).toBeNull();
      writeFileSync(binary, Buffer.from("not-a-real-binary"));
      expect(findCachedChromiumBinary([empty, binary])).toBe(binary);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("looks in /tmp so a warm instance can skip the pack download", () => {
    expect(chromiumCacheCandidates()).toContain("/tmp/chromium");
  });
});
