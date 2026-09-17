import { describe, expect, it } from "vitest";
import { SUBMIT_AND_SEND, SUBMIT_DRAFT, SUBMIT_SAVED_DRAFT } from "./copy";
import { appendPhotos } from "./photo-files";

describe("pending mutation UI", () => {
  it("keeps draft and submit labels", () => {
    expect(SUBMIT_DRAFT).toBe("Save as draft");
    expect(SUBMIT_AND_SEND).toBe("Save and submit");
    expect(SUBMIT_SAVED_DRAFT).toBe("Saved as draft");
    expect(appendPhotos(["a"], ["b"], 6)).toEqual(["a", "b"]);
  });
});
