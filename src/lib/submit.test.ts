import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSubmittedThisPeriod } from "./roster";
import {
  LETTER_AUTOSAVE_MS,
  includedSubmissions,
  isIncludedInCapsule,
  missedCountPhrase,
  nextAutosaveWrite,
  nextSubmissionWrite,
  parseSubmitIntent,
  shouldAutosaveLetter,
  submissionHasContent,
  visibleSubmitLetter,
  writtenCount,
  writtenCountPhrase,
} from "./submit";

const here = dirname(fileURLToPath(import.meta.url));

describe("submit model A", () => {
  it("treats blank intent as submit", () => {
    expect(parseSubmitIntent(null)).toBe("submitted");
    expect(parseSubmitIntent("submit")).toBe("submitted");
    expect(parseSubmitIntent("draft")).toBe("draft");
  });

  it("requires a letter or a photo to submit, not to draft", () => {
    expect(submissionHasContent("", 0)).toBe(false);
    expect(submissionHasContent("   ", 0)).toBe(false);
    expect(submissionHasContent("hello", 0)).toBe(true);
    expect(submissionHasContent("", 1)).toBe(true);
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

  it("keeps the posted letter after submit when the first-paint body is blank", () => {
    expect(
      visibleSubmitLetter({
        initialBody: "",
        currentBody: "",
        justSaved: true,
        savedBody: "October was loud and good.",
      }),
    ).toBe("October was loud and good.");
    expect(
      visibleSubmitLetter({
        initialBody: "October was loud and good.",
        currentBody: "",
        justSaved: false,
      }),
    ).toBe("October was loud and good.");
    expect(
      visibleSubmitLetter({
        initialBody: "October was loud and good.",
        currentBody: "October was loud and good.\n\nP.S. soup.",
        justSaved: false,
      }),
    ).toBe("October was loud and good.\n\nP.S. soup.");
  });
});

describe("submit action error handling", () => {
  it("catches unhandled save failures instead of throwing a digest 500", () => {
    const source = readFileSync(resolve(here, "../actions/submit.ts"), "utf8");
    expect(source).toContain("function isRedirectError");
    expect(source).toContain("collectPhotoFiles");
    expect(source).toContain('from "@/lib/photo-files"');
    expect(source).toContain("compressPhotoForStorage");
    expect(source).toContain("photo.buffer");
    expect(source).not.toMatch(/\.upload\(storagePath, buffer,/);
    expect(source).toContain('return { error: "Could not save." }');
    expect(source).toContain("submitBlockedReason");
    expect(source).toContain("submissionHasContent");
    expect(source).toContain("SUBMIT_EMPTY");
    expect(source).toMatch(/catch \(error\)/);
    expect(source).toContain("if (isRedirectError(error)) throw error");
  });

  it("autosaves letter drafts without touching the photo pipeline", () => {
    const source = readFileSync(resolve(here, "../actions/submit.ts"), "utf8");
    const start = source.indexOf("export async function saveLetterDraft");
    expect(start).toBeGreaterThan(-1);
    const autosave = source.slice(start);
    expect(autosave).toContain("nextAutosaveWrite");
    expect(autosave).not.toContain("collectPhotoFiles");
    expect(autosave).not.toContain("keep_path");
    expect(autosave).not.toContain("photos_touched");
    expect(autosave).not.toContain("compressPhotoForStorage");
    expect(autosave).not.toContain("validatePhotoList");
    expect(autosave).not.toContain(".from(\"photos\")");
  });
});

describe("letter autosave vs final submit", () => {
  const now = "2026-10-05T12:00:00.000Z";

  it("debounces about 2s and skips unchanged, closed, busy, or already-submitted letters", () => {
    expect(LETTER_AUTOSAVE_MS).toBe(2_000);
    expect(
      shouldAutosaveLetter({
        closed: false,
        submitted: false,
        explicitBusy: false,
        currentBody: "October was loud.",
        lastSavedBody: "",
      }),
    ).toBe(true);
    expect(
      shouldAutosaveLetter({
        closed: false,
        submitted: false,
        explicitBusy: false,
        currentBody: "October was loud.",
        lastSavedBody: "October was loud.",
      }),
    ).toBe(false);
    expect(
      shouldAutosaveLetter({
        closed: true,
        submitted: false,
        explicitBusy: false,
        currentBody: "October was loud.",
        lastSavedBody: "",
      }),
    ).toBe(false);
    expect(
      shouldAutosaveLetter({
        closed: false,
        submitted: true,
        explicitBusy: false,
        currentBody: "October was loud.",
        lastSavedBody: "",
      }),
    ).toBe(false);
    expect(
      shouldAutosaveLetter({
        closed: false,
        submitted: false,
        explicitBusy: true,
        currentBody: "October was loud.",
        lastSavedBody: "",
      }),
    ).toBe(false);
  });

  it("stores autosave as a draft that is Not yet and never compiled", () => {
    const autosave = nextAutosaveWrite({
      existing: null,
      body: "Soup weather.",
      now,
    });
    expect(autosave.skip).toBe(false);
    if (autosave.skip) throw new Error("expected autosave write");
    expect(autosave.status).toBe("draft");
    expect(autosave.patch.status).toBe("draft");
    expect(autosave.patch.body).toBe("Soup weather.");
    expect(isSubmittedThisPeriod(autosave.patch)).toBe(false);
    expect(isIncludedInCapsule(autosave.patch)).toBe(false);
    expect(writtenCount([autosave.patch, { status: "submitted" }])).toBe(1);

    const later = nextAutosaveWrite({
      existing: { status: "draft" },
      body: "Soup weather, still.",
      now: "2026-10-05T12:00:02.000Z",
    });
    expect(later.skip).toBe(false);
    if (later.skip) throw new Error("expected draft update");
    expect(later.patch.status).toBe("draft");
    expect(isSubmittedThisPeriod(later.patch)).toBe(false);
    expect(isIncludedInCapsule(later.patch)).toBe(false);
  });

  it("keeps Submit as the only final action and does not demote a submitted letter", () => {
    const submitted = nextSubmissionWrite({
      existing: { status: "draft" },
      body: "Soup weather.",
      intent: "submitted",
      now,
    });
    expect(submitted.status).toBe("submitted");
    expect(isSubmittedThisPeriod(submitted)).toBe(true);
    expect(isIncludedInCapsule(submitted)).toBe(true);

    const lateAutosave = nextAutosaveWrite({
      existing: { status: "submitted" },
      body: "typed after submit",
      now: "2026-10-05T12:01:00.000Z",
    });
    expect(lateAutosave).toEqual({ skip: true, status: "submitted" });
    expect(isSubmittedThisPeriod({ status: lateAutosave.status })).toBe(true);
    expect(isIncludedInCapsule({ status: lateAutosave.status })).toBe(true);
  });

  it("locks the product copy: letter autosave is a draft, photos never autosave", () => {
    const readme = readFileSync(resolve(here, "../../README.md"), "utf8");
    expect(readme).toContain("Photos never autosave");
    expect(readme).toContain("Draft saved");
    expect(readme).toContain("is the only final action");
    expect(readme).toMatch(/draft is \*\*Not yet\*\*/);
  });
});
