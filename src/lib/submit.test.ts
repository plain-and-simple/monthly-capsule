import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhotoCompressError } from "./photo-compress";
import { isSubmittedThisPeriod, rosterPeriodLabel } from "./roster";
import { ROSTER_NOT_YET } from "./copy";
import {
  LETTER_AUTOSAVE_MS,
  POSTGRES_UNIQUE_VIOLATION,
  SUBMIT_COMMIT_ORDER,
  applyAutosaveInsert,
  applyAutosaveUpdate,
  failedSubmitSnapshot,
  includedSubmissions,
  isIncludedInCapsule,
  isUniqueConstraintError,
  missedCountPhrase,
  newPhotoStorageNonce,
  nextAutosaveWrite,
  nextSubmissionWrite,
  parseSubmitIntent,
  photoStoragePath,
  runSubmitPhotoCommit,
  shouldAutosaveLetter,
  splitKeptAndDroppedPhotos,
  submitPhotoFailureLog,
  submissionHasContent,
  visibleSubmitLetter,
  writtenCount,
  writtenCountPhrase,
  type StoredPhotoRef,
  type SubmitCommitDeps,
  type SubmitStatus,
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
    expect(source).toContain("runSubmitPhotoCommit");
    expect(source).toContain("logSubmitPhotoFailure");
    expect(source).toContain("upsert: false");
    expect(source).not.toContain("upsert: true");
    expect(source).toMatch(/catch \(error\)/);
    expect(source).toContain("if (isRedirectError(error)) throw error");
  });

  it("autosaves letter drafts without touching the photo pipeline", () => {
    const source = readFileSync(resolve(here, "../actions/submit.ts"), "utf8");
    const start = source.indexOf("export async function saveLetterDraft");
    expect(start).toBeGreaterThan(-1);
    const autosave = source.slice(start);
    expect(autosave).toContain("nextAutosaveWrite");
    expect(autosave).toContain('.neq("status", "submitted")');
    expect(autosave).toContain("isUniqueConstraintError");
    expect(autosave).not.toContain("upsert");
    expect(autosave).not.toContain("collectPhotoFiles");
    expect(autosave).not.toContain("keep_path");
    expect(autosave).not.toContain("photos_touched");
    expect(autosave).not.toContain("compressPhotoForStorage");
    expect(autosave).not.toContain("validatePhotoList");
    expect(autosave).not.toContain(".from(\"photos\")");
    expect(autosave).not.toContain("runSubmitPhotoCommit");
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

  it("keeps submitted status and text when a late autosave lands after submit", () => {
    const submitted = { status: "submitted" as const, body: "Final soup letter." };
    const staleDraft = { status: "draft" as const, body: "stale typed in another tab" };

    const afterUpdate = applyAutosaveUpdate({ current: submitted, patch: staleDraft });
    expect(afterUpdate.applied).toBe(false);
    expect(afterUpdate.row).toEqual(submitted);
    expect(afterUpdate.row.body).toBe("Final soup letter.");
    expect(isSubmittedThisPeriod(afterUpdate.row)).toBe(true);
    expect(isIncludedInCapsule(afterUpdate.row)).toBe(true);

    const afterInsert = applyAutosaveInsert({ current: submitted, insert: staleDraft });
    expect(afterInsert.applied).toBe(false);
    expect(afterInsert.uniqueConflict).toBe(true);
    expect(afterInsert.row).toEqual(submitted);
    expect(afterInsert.row.body).toBe("Final soup letter.");
    expect(isSubmittedThisPeriod(afterInsert.row)).toBe(true);
    expect(isIncludedInCapsule(afterInsert.row)).toBe(true);

    expect(isUniqueConstraintError({ code: POSTGRES_UNIQUE_VIOLATION })).toBe(true);
    expect(isUniqueConstraintError({ code: "23503" })).toBe(false);
    expect(POSTGRES_UNIQUE_VIOLATION).toBe("23505");

    expect(
      applyAutosaveUpdate({
        current: { status: "draft", body: "old draft" },
        patch: staleDraft,
      }).applied,
    ).toBe(true);
    expect(
      applyAutosaveInsert({
        current: null,
        insert: staleDraft,
      }).applied,
    ).toBe(true);

    const source = readFileSync(resolve(here, "../actions/submit.ts"), "utf8");
    const autosave = source.slice(source.indexOf("export async function saveLetterDraft"));
    expect(autosave).toContain('.update(write.patch)');
    expect(autosave).toContain('.eq("id", existing.id)');
    expect(autosave).toContain('.neq("status", "submitted")');
    expect(autosave).toMatch(/if \(isUniqueConstraintError\(error\)\)/);
  });

  it("locks the product copy: letter autosave is a draft, photos never autosave", () => {
    const readme = readFileSync(resolve(here, "../../README.md"), "utf8");
    expect(readme).toContain("Photos never autosave");
    expect(readme).toContain("Draft saved");
    expect(readme).toContain("is the only final action");
    expect(readme).toMatch(/draft is \*\*Not yet\*\*/);
  });
});

const OLD_PHOTO: StoredPhotoRef = { id: "p1", storage_path: "g/m/s/0.webp" };

function createSubmitHarness(options: {
  existing?: { id: string; status: SubmitStatus | null; body: string } | null;
  photos?: StoredPhotoRef[];
  failAt?: "compress" | "upload" | "insert" | "write" | null;
}) {
  const existing = options.existing === undefined ? null : options.existing;
  const state = {
    submission: existing ? { ...existing } : (null as typeof existing),
    photos: [...(options.photos ?? [])],
    objects: new Set((options.photos ?? []).map((photo) => photo.storage_path)),
    logs: [] as Array<{ photoIndex: number; stage: string; errorName: string }>,
  };

  const deps: SubmitCommitDeps = {
    compressFile: async () => {
      if (options.failAt === "compress") {
        throw new PhotoCompressError();
      }
      return {
        buffer: new Uint8Array([1, 2, 3]),
        contentType: "image/webp",
        width: 10,
        height: 8,
        bytes: 3,
      };
    },
    uploadPhoto: async (path) => {
      if (options.failAt === "upload") {
        return { error: { name: "StorageApiError" } };
      }
      state.objects.add(path);
      return {};
    },
    loadPhotos: async () => [...state.photos],
    insertPhotoRows: async (rows) => {
      if (options.failAt === "insert") {
        return { error: { name: "PostgrestError" } };
      }
      for (const row of rows) {
        state.photos.push({ id: `new-${row.sort_order}`, storage_path: row.storage_path });
      }
      return {};
    },
    writeSubmission: async ({ existingId, patch }) => {
      if (options.failAt === "write" && patch.status === "submitted") {
        return { error: "Could not save." };
      }
      const id = existingId ?? state.submission?.id ?? "sub-1";
      state.submission = { id, status: patch.status, body: patch.body };
      return { id };
    },
    deleteDroppedPhotos: async (dropped) => {
      const paths = new Set(dropped.map((photo) => photo.storage_path));
      state.photos = state.photos.filter((photo) => !paths.has(photo.storage_path));
      for (const path of paths) state.objects.delete(path);
    },
    cleanupUploads: async (paths) => {
      for (const path of paths) state.objects.delete(path);
    },
    rollbackNewPhotos: async (paths) => {
      const remove = new Set(paths);
      state.photos = state.photos.filter((photo) => !remove.has(photo.storage_path));
      for (const path of paths) state.objects.delete(path);
    },
    makeNonce: () => "nonce1",
    photoExt: (type) => (type === "image/webp" ? "webp" : "jpg"),
    logPhotoFailure: ({ photoIndex, stage, error }) => {
      const errorName =
        error instanceof Error ? error.name : String((error as { name?: string })?.name ?? "Error");
      state.logs.push({ photoIndex, stage, errorName });
    },
  };

  return { state, deps };
}

async function runAttempt(
  harness: ReturnType<typeof createSubmitHarness>,
  input: {
    existing: { id: string; status: SubmitStatus | null; body: string } | null;
    body: string;
    intent?: SubmitStatus;
    fileCount?: number;
    keepPaths?: string[];
    photosTouched?: boolean;
  },
) {
  return runSubmitPhotoCommit({
    existing: input.existing,
    body: input.body,
    intent: input.intent ?? "submitted",
    fileCount: input.fileCount ?? 1,
    keepPaths: input.keepPaths ?? [],
    photosTouched: input.photosTouched ?? true,
    now: "2026-10-11T12:00:00.000Z",
    groupId: "group-1",
    monthId: "month-1",
    readFileBytes: async () => new Uint8Array([9, 9, 9]),
    deps: harness.deps,
  });
}

describe("submit photo atomicity", () => {
  it("uses nonce paths so new uploads never overwrite kept photos", () => {
    expect(SUBMIT_COMMIT_ORDER).toEqual([
      "persist_draft",
      "compress",
      "upload",
      "insert_photos",
      "write_submitted",
      "delete_dropped",
    ]);
    const nonce = newPhotoStorageNonce();
    expect(nonce).toMatch(/^[0-9a-f]{8}$/);
    expect(
      photoStoragePath({
        groupId: "g",
        monthId: "m",
        submissionId: "s",
        sortOrder: 1,
        ext: "webp",
        nonce: "ab12cd34",
      }),
    ).toBe("g/m/s/ab12cd34-1.webp");
    expect(splitKeptAndDroppedPhotos([OLD_PHOTO, { id: "p2", storage_path: "drop.webp" }], ["g/m/s/0.webp"])).toEqual({
      kept: [OLD_PHOTO],
      dropped: [{ id: "p2", storage_path: "drop.webp" }],
    });
    expect(submitPhotoFailureLog({ groupId: "g", photoIndex: 1, stage: "upload", error: { name: "StorageApiError" } })).toEqual({
      message: "submitLetter photo failed",
      context: { groupId: "g", photoIndex: 1, stage: "upload", errorName: "StorageApiError" },
    });
  });

  it("keeps a failed first Submit as a draft and Not yet on the roster", async () => {
    const draft = { id: "sub-1", status: "draft" as const, body: "October was loud." };
    const harness = createSubmitHarness({ existing: draft, failAt: "compress" });
    const result = await runAttempt(harness, { existing: draft, body: "October was loud." });

    expect(result).toEqual({ error: "Could not compress that photo. Try another." });
    expect(harness.state.submission).toEqual({ id: "sub-1", status: "draft", body: "October was loud." });
    expect(harness.state.submission?.status).not.toBe("submitted");
    expect(isSubmittedThisPeriod(harness.state.submission)).toBe(false);
    expect(rosterPeriodLabel(false, true)).toBe(ROSTER_NOT_YET);
    expect(harness.state.logs[0]?.stage).toBe("compress");

    const snapshot = failedSubmitSnapshot({
      existing: draft,
      attemptedBody: "October was loud.",
      existingPhotos: [],
    });
    expect(snapshot.status).toBe("draft");
    expect(snapshot.body).toBe("October was loud.");
    expect(snapshot.rosterSubmitted).toBe(false);
    expect(isSubmittedThisPeriod(snapshot)).toBe(false);
  });

  it("saves letter text as a draft when a new Submit fails before any row exists", async () => {
    const harness = createSubmitHarness({ existing: null, failAt: "compress" });
    const result = await runAttempt(harness, { existing: null, body: "Soup weather." });

    expect(result).toHaveProperty("error");
    expect(harness.state.submission).toEqual({
      id: "sub-1",
      status: "draft",
      body: "Soup weather.",
    });
    expect(isSubmittedThisPeriod(harness.state.submission)).toBe(false);
    expect(rosterPeriodLabel(isSubmittedThisPeriod(harness.state.submission), true)).toBe(ROSTER_NOT_YET);
  });

  it("preserves old photos and body when storage upload fails on an edit", async () => {
    const existing = { id: "sub-1", status: "draft" as const, body: "Draft soup." };
    const harness = createSubmitHarness({
      existing,
      photos: [OLD_PHOTO],
      failAt: "upload",
    });
    const result = await runAttempt(harness, {
      existing,
      body: "Edited soup.",
      keepPaths: [OLD_PHOTO.storage_path],
    });

    expect(result).toEqual({ error: "Could not store photo." });
    expect(harness.state.submission).toEqual({ id: "sub-1", status: "draft", body: "Edited soup." });
    expect(harness.state.photos).toEqual([OLD_PHOTO]);
    expect([...harness.state.objects]).toEqual([OLD_PHOTO.storage_path]);
    expect(harness.state.logs[0]).toMatchObject({ stage: "upload", errorName: "StorageApiError" });
  });

  it("leaves an already-submitted letter and photos unchanged when a resubmit fails", async () => {
    const submitted = { id: "sub-1", status: "submitted" as const, body: "Original letter." };
    const harness = createSubmitHarness({
      existing: submitted,
      photos: [OLD_PHOTO],
      failAt: "upload",
    });
    const result = await runAttempt(harness, {
      existing: submitted,
      body: "Edited letter.",
      keepPaths: [OLD_PHOTO.storage_path],
    });

    expect(result).toEqual({ error: "Could not store photo." });
    expect(harness.state.submission).toEqual(submitted);
    expect(harness.state.submission?.body).toBe("Original letter.");
    expect(harness.state.photos).toEqual([OLD_PHOTO]);
    expect([...harness.state.objects]).toEqual([OLD_PHOTO.storage_path]);
    expect(isSubmittedThisPeriod(harness.state.submission)).toBe(true);

    const snapshot = failedSubmitSnapshot({
      existing: submitted,
      attemptedBody: "Edited letter.",
      existingPhotos: [OLD_PHOTO],
    });
    expect(snapshot.persistDraft).toBe(false);
    expect(snapshot.body).toBe("Original letter.");
    expect(snapshot.photos).toEqual([OLD_PHOTO]);
    expect(snapshot.rosterSubmitted).toBe(true);
  });

  it("sets submitted and stores photos on the success path", async () => {
    const draft = { id: "sub-1", status: "draft" as const, body: "Soup weather." };
    const harness = createSubmitHarness({ existing: draft, photos: [OLD_PHOTO] });
    const result = await runAttempt(harness, {
      existing: draft,
      body: "Soup weather, sent.",
      keepPaths: [OLD_PHOTO.storage_path],
    });

    expect(result).toEqual({ ok: true, status: "submitted" });
    expect(harness.state.submission).toEqual({
      id: "sub-1",
      status: "submitted",
      body: "Soup weather, sent.",
    });
    expect(isSubmittedThisPeriod(harness.state.submission)).toBe(true);
    expect(harness.state.photos.map((photo) => photo.storage_path)).toEqual([
      OLD_PHOTO.storage_path,
      "group-1/month-1/sub-1/nonce1-1.webp",
    ]);
    expect(harness.state.objects.has("group-1/month-1/sub-1/nonce1-1.webp")).toBe(true);
    expect(harness.state.logs).toEqual([]);
  });

  it("does not delete dropped photos until the new rows are committed", async () => {
    const submitted = { id: "sub-1", status: "submitted" as const, body: "Original letter." };
    const harness = createSubmitHarness({
      existing: submitted,
      photos: [OLD_PHOTO],
      failAt: "insert",
    });
    const result = await runAttempt(harness, {
      existing: submitted,
      body: "Edited letter.",
      keepPaths: [],
    });

    expect(result).toEqual({ error: "Could not save photos." });
    expect(harness.state.submission).toEqual(submitted);
    expect(harness.state.photos).toEqual([OLD_PHOTO]);
    expect([...harness.state.objects]).toEqual([OLD_PHOTO.storage_path]);
  });
});
