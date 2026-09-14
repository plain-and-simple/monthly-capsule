import { describe, expect, it } from "vitest";
import { mapSignedUrlRows } from "./photo-urls";

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
