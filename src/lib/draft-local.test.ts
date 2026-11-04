import { describe, expect, it } from "vitest";
import {
  letterDraftStorageKey,
  parseLocalLetterDraft,
  serializeLocalLetterDraft,
  shouldRestoreLocalDraft,
} from "./draft-local";
import { canRetryDraftSave, DRAFT_RETRY_BACKOFF_MS, isRetryableSave } from "./draft-retry";
import { LETTER_AUTOSAVE_MS, LETTER_FIRST_AUTOSAVE_MS, letterAutosaveDelay } from "./submit";

describe("local letter draft", () => {
  it("keys the copy per group, month, and member", () => {
    expect(
      letterDraftStorageKey({
        groupId: "11111111-1111-4111-8111-111111111111",
        yearMonth: "2026-10",
        memberId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(
      "mc-letter-draft:11111111-1111-4111-8111-111111111111:2026-10:22222222-2222-4222-8222-222222222222",
    );
    expect(letterDraftStorageKey({ groupId: "", yearMonth: "2026-10", memberId: "m" })).toBeNull();
  });

  it("restores when local is longer or newer than the server draft", () => {
    const local = { body: "typed draft", updatedAt: "2026-10-05T12:00:02.000Z" };
    expect(
      shouldRestoreLocalDraft({
        local,
        serverBody: "typed",
        serverUpdatedAt: "2026-10-05T12:00:01.000Z",
      }),
    ).toBe(true);
    expect(
      shouldRestoreLocalDraft({
        local: { body: "new", updatedAt: "2026-10-05T12:00:05.000Z" },
        serverBody: "older server draft",
        serverUpdatedAt: "2026-10-05T12:00:01.000Z",
      }),
    ).toBe(true);
    expect(
      shouldRestoreLocalDraft({
        local: { body: "typed draft", updatedAt: "2026-10-05T12:00:00.000Z" },
        serverBody: "typed draft",
        serverUpdatedAt: "2026-10-05T12:00:01.000Z",
      }),
    ).toBe(false);
    expect(
      shouldRestoreLocalDraft({
        local: null,
        serverBody: "",
        serverUpdatedAt: null,
      }),
    ).toBe(false);
  });

  it("round-trips without extra fields", () => {
    const raw = serializeLocalLetterDraft({ body: "typed draft", updatedAt: "2026-10-05T12:00:00.000Z" });
    expect(JSON.parse(raw)).toEqual({ body: "typed draft", updatedAt: "2026-10-05T12:00:00.000Z" });
    expect(parseLocalLetterDraft(raw)?.body).toBe("typed draft");
    expect(parseLocalLetterDraft("not-json")).toBeNull();
  });
});

describe("draft retry and first autosave", () => {
  it("saves about 1s after typing starts, then debounces 2s", () => {
    expect(LETTER_FIRST_AUTOSAVE_MS).toBe(1_000);
    expect(LETTER_AUTOSAVE_MS).toBe(2_000);
    expect(letterAutosaveDelay(false)).toBe(1_000);
    expect(letterAutosaveDelay(true)).toBe(2_000);
  });

  it("retries only { ok:false, retry:true } with a short backoff cap", () => {
    expect(isRetryableSave({ ok: false, retry: true })).toBe(true);
    expect(isRetryableSave({ ok: true, status: "draft" })).toBe(false);
    expect(isRetryableSave({ error: "Could not save." })).toBe(false);
    expect(canRetryDraftSave(0)).toBe(true);
    expect(canRetryDraftSave(DRAFT_RETRY_BACKOFF_MS.length)).toBe(false);
  });
});
