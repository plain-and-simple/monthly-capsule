export type LocalLetterDraft = {
  body: string;
  updatedAt: string;
};

export function letterDraftStorageKey(input: {
  groupId: string;
  yearMonth: string;
  memberId: string;
}): string | null {
  const groupId = input.groupId.trim();
  const yearMonth = input.yearMonth.trim();
  const memberId = input.memberId.trim();
  if (!groupId || !yearMonth || !memberId) return null;
  return `mc-letter-draft:${groupId}:${yearMonth}:${memberId}`;
}

export function parseLocalLetterDraft(raw: string | null | undefined): LocalLetterDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalLetterDraft>;
    if (typeof parsed.body !== "string") return null;
    if (typeof parsed.updatedAt !== "string" || !parsed.updatedAt) return null;
    return { body: parsed.body, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function serializeLocalLetterDraft(draft: LocalLetterDraft): string {
  return JSON.stringify({ body: draft.body, updatedAt: draft.updatedAt });
}

/** Restore when the local copy is newer or longer than the server draft. */
export function shouldRestoreLocalDraft(input: {
  local: LocalLetterDraft | null;
  serverBody: string;
  serverUpdatedAt: string | null;
}): boolean {
  const local = input.local;
  if (!local || local.body.length === 0) return false;
  if (local.body === input.serverBody) return false;
  if (local.body.length > input.serverBody.length) return true;
  const serverAt = Date.parse(input.serverUpdatedAt ?? "");
  const localAt = Date.parse(local.updatedAt);
  if (!Number.isFinite(localAt)) return false;
  if (!Number.isFinite(serverAt)) return true;
  return localAt > serverAt;
}

export function readLocalLetterDraft(storage: Pick<Storage, "getItem">, key: string | null): LocalLetterDraft | null {
  if (!key) return null;
  try {
    return parseLocalLetterDraft(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeLocalLetterDraft(
  storage: Pick<Storage, "setItem">,
  key: string | null,
  body: string,
  updatedAt: string,
): void {
  if (!key) return;
  try {
    storage.setItem(key, serializeLocalLetterDraft({ body, updatedAt }));
  } catch {
    // Private mode / quota — keep typing.
  }
}

export function clearLocalLetterDraft(storage: Pick<Storage, "removeItem">, key: string | null): void {
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}
