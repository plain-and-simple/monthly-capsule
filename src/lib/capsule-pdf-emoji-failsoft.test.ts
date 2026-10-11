import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("subset-font", () => ({
  default: vi.fn(async () => {
    throw new Error("hb-subset wasm failed");
  }),
}));

import { buildCapsuleArchive } from "./capsule-archive";
import { buildCapsulePdfBytes } from "./capsule-pdf";

function inflatePdfStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    try {
      streams.push(inflateSync(Buffer.from(match[1]!, "latin1")).toString("latin1"));
    } catch {
      streams.push(Buffer.from(match[1]!, "latin1").toString("latin1"));
    }
  }
  return streams;
}

function utf16BeFromHex(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 3 < hex.length; i += 4) {
    units.push(parseInt(hex.slice(i, i + 4), 16));
  }
  return String.fromCharCode(...units);
}

function pdfExtractText(bytes: Uint8Array): string {
  const streams = inflatePdfStreams(bytes);
  const cmaps: Array<Map<string, string>> = [];
  for (const stream of streams) {
    if (!stream.includes("begincmap")) continue;
    const map = new Map<string, string>();
    for (const entry of stream.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(entry[1]!.toUpperCase().padStart(4, "0"), utf16BeFromHex(entry[2]!));
    }
    if (map.size > 0) cmaps.push(map);
  }
  const chunks: string[] = [];
  for (const stream of streams) {
    if (!/\sTj\b/.test(stream) && !/\sTJ\b/.test(stream)) continue;
    for (const entry of stream.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = entry[1]!.toUpperCase();
      for (const cmap of cmaps) {
        let text = "";
        for (let i = 0; i < hex.length; i += 4) {
          text += cmap.get(hex.slice(i, i + 4)) ?? "";
        }
        if (text) chunks.push(text);
      }
    }
  }
  return chunks.join("\n");
}

describe("emoji subset fail-soft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still builds the capsule PDF when subsetFont throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = "October note with plain 😅 🎉 text mixed in.";
    const bytes = await buildCapsulePdfBytes({
      archive: buildCapsuleArchive({
        yearMonth: "2026-10",
        groupName: "Regression Kitchen",
        memberCount: 1,
        letters: [{ preferred_name: "Alex Rivera", body, photos: [] }],
      }),
      photos: [],
    });
    expect(Buffer.from(bytes.slice(0, 4)).toString("ascii")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(800);
    const text = pdfExtractText(bytes);
    expect(text).toContain("October");
    expect(text).toContain("plain");
    expect(text).toContain("Alex Rivera");
    expect(logged).toHaveBeenCalled();
    const haystack = JSON.stringify(logged.mock.calls);
    expect(haystack).toContain("capsule pdf emoji subset failed");
    expect(haystack).toContain("errorName");
    expect(haystack).not.toContain(body);
    expect(haystack).not.toContain("😅");
    expect(haystack).not.toContain("🎉");
  });
});
