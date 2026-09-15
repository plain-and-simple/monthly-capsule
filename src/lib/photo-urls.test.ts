import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SIGNED_URL_TIMEOUT_MS } from "./photo-timeout";
import { mapSignedUrlRows } from "./photo-urls";

const here = dirname(fileURLToPath(import.meta.url));

describe("mapSignedUrlRows", () => {
  it("batches paths onto signed URLs and keeps misses null", () => {
    const mapped = mapSignedUrlRows(
      ["a.jpg", "b.jpg", "c.jpg"],
      [
        { path: "a.jpg", signedUrl: "https://cdn/a.jpg" },
        { path: "c.jpg", signedUrl: "https://cdn/c.jpg", error: "nope" },
        { path: "missing.jpg", signedUrl: "https://cdn/missing.jpg" },
      ],
    );
    expect(mapped.get("a.jpg")).toBe("https://cdn/a.jpg");
    expect(mapped.get("b.jpg")).toBeNull();
    expect(mapped.get("c.jpg")).toBeNull();
    expect(mapped.has("missing.jpg")).toBe(false);
  });

  it("returns an empty map for no paths", () => {
    expect(mapSignedUrlRows([], [{ path: "a.jpg", signedUrl: "https://cdn/a.jpg" }]).size).toBe(0);
  });
});

describe("signed URL hang guard", () => {
  it("batches capsule photos behind a timeout and fail-soft", () => {
    expect(SIGNED_URL_TIMEOUT_MS).toBe(8_000);
    const source = readFileSync(resolve(here, "./photos.ts"), "utf8");
    expect(source).toContain("withTimeout");
    expect(source).toContain("SIGNED_URL_TIMEOUT_MS");
    expect(source).toContain("createSignedUrls");
    const reset = readFileSync(resolve(here, "./password-reset-mail.ts"), "utf8");
    expect(reset).toContain("withTimeout");
    expect(reset).toContain("RESEND_SEND_TIMEOUT_MS");
  });
});

