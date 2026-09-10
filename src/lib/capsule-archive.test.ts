import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCapsuleArchive,
  capsuleHasArchive,
  capsuleViewSource,
  parseCapsuleArchive,
} from "./capsule-archive";

const here = dirname(fileURLToPath(import.meta.url));

const liveLetter = {
  preferred_name: "Edited later",
  body: "this mutation must not replace the archive",
  photos: [],
};

const snapshot = buildCapsuleArchive({
  yearMonth: "2026-10",
  groupName: "stepppy",
  memberCount: 3,
  letters: [
    {
      preferred_name: "Chacha",
      body: "Hello world",
      photos: [{ storage_path: "g/m/p.jpg", width: 800, height: 600, sort_order: 0 }],
    },
  ],
});

describe("capsule archive snapshot", () => {
  it("stores letters, photo paths, html, and a missed count", () => {
    expect(snapshot.version).toBe(1);
    expect(snapshot.year_month).toBe("2026-10");
    expect(snapshot.letters).toHaveLength(1);
    expect(snapshot.letters[0]?.photos[0]?.storage_path).toBe("g/m/p.jpg");
    expect(snapshot.html).toContain("Hello world");
    expect(snapshot.html).toContain('data-storage-path="g/m/p.jpg"');
    expect(snapshot.html).not.toContain("http");
    expect(snapshot.missed_count).toBe(2);
    expect(capsuleHasArchive(snapshot)).toBe(true);
    expect(parseCapsuleArchive(snapshot)?.letters[0]?.preferred_name).toBe("Chacha");
  });

  it("rejects garbage so a marker row is treated as missing", () => {
    expect(parseCapsuleArchive(null)).toBeNull();
    expect(parseCapsuleArchive({})).toBeNull();
    expect(capsuleHasArchive({ month_id: "x" })).toBe(false);
  });

  it("view prefers the archive over live submissions", () => {
    const view = capsuleViewSource(snapshot, [liveLetter]);
    expect(view.source).toBe("archive");
    expect(view.letters[0]?.preferred_name).toBe("Chacha");
    expect(view.letters[0]?.body).toBe("Hello world");
    expect(view.letters[0]?.body).not.toContain("mutation");
  });

  it("view falls back to live letters when no archive exists", () => {
    const view = capsuleViewSource(null, [liveLetter]);
    expect(view.source).toBe("live");
    expect(view.letters).toEqual([liveLetter]);
  });
});

describe("compile and view wire the archive", () => {
  it("compile stores an archive on the capsule row", () => {
    const source = readFileSync(resolve(here, "./compile.ts"), "utf8");
    expect(source).toContain("buildCapsuleArchive");
    expect(source).toContain("archive");
    expect(source).toMatch(/insert\(\{[\s\S]*archive/);
  });

  it("capsule page serves the archive to members", () => {
    const page = readFileSync(resolve(here, "../app/(app)/g/[uuid]/capsule/[yearMonth]/page.tsx"), "utf8");
    expect(page).toContain("parseCapsuleArchive");
    expect(page).toContain("ensureCapsuleArchive");
    expect(page).toContain("archive.letters");
    expect(page).not.toContain("includedSubmissions");
  });
});
