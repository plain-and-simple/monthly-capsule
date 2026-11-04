import { TransientError } from "@/lib/transient-error";

export const MEMBERSHIP_RETRY_BACKOFF_MS = [200, 400] as const;

export type LookupErrorShape = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
  name?: string | null;
};

export type MaybeSingleResult<T> = {
  data: T | null;
  error: LookupErrorShape | null;
};

export type LookupClassified<T> =
  | { kind: "row"; row: T }
  | { kind: "no_row" }
  | { kind: "error"; code: string };

export function lookupErrorCode(error: LookupErrorShape | null | undefined): string {
  if (!error) return "transient";
  const message = String(error.message ?? "");
  if (/PGRST303/i.test(message) || /jwt claims/i.test(message)) return "PGRST303";
  const code = String(error.code ?? "").trim();
  if (code) return code;
  if (error.status != null) return String(error.status);
  if (error.name) return String(error.name);
  if (message.trim()) return "lookup_error";
  return "transient";
}

/**
 * maybeSingle: no error + null data is a confirmed miss.
 * Any PostgREST/network error is not "not a member".
 */
export function classifyMaybeSingle<T>(result: MaybeSingleResult<T>): LookupClassified<T> {
  if (result.error) {
    return { kind: "error", code: lookupErrorCode(result.error) };
  }
  if (result.data == null) return { kind: "no_row" };
  return { kind: "row", row: result.data };
}

export function classifyThrownLookup(error: unknown): string {
  if (error instanceof TransientError) return error.code;
  if (!error || typeof error !== "object") return "network";
  const value = error as LookupErrorShape & { cause?: unknown };
  return lookupErrorCode(value);
}

export async function fetchMaybeSingleWithRetry<T>(
  run: () => Promise<MaybeSingleResult<T>>,
  opts?: {
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T | null> {
  const sleep = opts?.sleep ?? defaultSleep;
  const attempts = 1 + MEMBERSHIP_RETRY_BACKOFF_MS.length;
  let lastCode = "transient";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const wait = MEMBERSHIP_RETRY_BACKOFF_MS[attempt - 1] ?? MEMBERSHIP_RETRY_BACKOFF_MS.at(-1)!;
      await sleep(wait);
    }

    let result: MaybeSingleResult<T>;
    try {
      result = await run();
    } catch (error) {
      lastCode = classifyThrownLookup(error);
      continue;
    }

    const classified = classifyMaybeSingle(result);
    if (classified.kind === "row") return classified.row;
    if (classified.kind === "no_row") return null;
    lastCode = classified.code;
  }

  throw new TransientError(lastCode);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
