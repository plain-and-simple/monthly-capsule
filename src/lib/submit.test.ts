import { describe, expect, it } from "vitest";
import {
  includedSubmissions,
  isIncludedInCapsule,
  missedCountPhrase,
  nextSubmissionWrite,
  parseSubmitIntent,
  writtenCount,
  writtenCountPhrase,
} from "./submit";

describe("submit model A", () => {
  it("treats blank intent as submit", () => {
    expect(parseSubmitIntent(null)).toBe("submitted");
    expect(parseSubmitIntent("submit")).toBe("submitted");
    expect(parseSubmitIntent("draft")).toBe("draft");
  });

  it("hides drafts from the compiled capsule and treats legacy rows as submitted", () => {
    expect(isIncludedInCapsule({ status: "draft" })).toBe(false);
    expect(isIncludedInCapsule({ status: "submitted" })).toBe(true);
    expect(isIncludedInCapsule({})).toBe(true);
    expect(isIncludedInCapsule({ status: null })).toBe(true);
    expect(
      includedSubmissions([{ status: "draft" }, { status: "submitted" }, {}]).map((row) => row.status),
    ).toEqual(["submitted", undefined]);
  });

  it("counts only submitted letters as written", () => {
    expect(writtenCount([{ status: "draft" }, { status: "submitted" }, { status: "submitted" }])).toBe(
      2,
    );
    expect(writtenCountPhrase(3, 6)).toBe("Three of six have written");
    expect(writtenCountPhrase(1, 4)).toBe("One of four has written");
  });

  it("states late writers as a count, never a name", () => {
    expect(missedCountPhrase(0)).toBe("Everyone wrote this month.");
    expect(missedCountPhrase(1)).toBe("One person did not write this month.");
    expect(missedCountPhrase(2)).toBe("Two people did not write this month.");
    expect(missedCountPhrase(1)).not.toMatch(/[A-Z][a-z]+ did not write/);
  });

  it("keeps first submitted_at when an included letter is edited", () => {
    const now = "2026-09-10T12:00:00.000Z";
    const first = nextSubmissionWrite({
      existing: null,
      body: "hello",
      intent: "draft",
      now,
    });
    expect(first).toEqual({
      body: "hello",
      status: "draft",
      updated_at: now,
      submitted_at: now,
    });

    const promoted = nextSubmissionWrite({
      existing: { status: "draft" },
      body: "hello again",
      intent: "submitted",
      now: "2026-09-11T12:00:00.000Z",
    });
    expect(promoted.status).toBe("submitted");
    expect(promoted.submitted_at).toBe("2026-09-11T12:00:00.000Z");

    const edited = nextSubmissionWrite({
      existing: { status: "submitted" },
      body: "changed",
      intent: "submitted",
      now: "2026-09-12T12:00:00.000Z",
    });
    expect(edited.status).toBe("submitted");
    expect(edited.submitted_at).toBeUndefined();
  });
});
