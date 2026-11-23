import { TransientError } from "@/lib/transient-error";

export const MEMBERSHIP_RETRY_BACKOFF_MS = [200, 400] as const;

/**
 * Distinct header so Next.js request memoization cannot replay one GET
 * for every attempt. The dedupe key includes headers and ignores `cache`.
 */
export const RETRY_ATTEMPT_HEADER = "x-retry-attempt";

export type LookupErrorShape = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
  name?: string | null;
};

export type MaybeSingleResult<T> = {
  data: T | null;
  error: LookupErrorShape | null;
  status?: number | null;
};

export type LookupClassified<T> =
  | { kind: "row"; row: T }
  | { kind: "no_row" }
  | { kind: "error"; code: string };

export type MembershipRetryAttempt = {
  /** 1-based. Also sent as `x-retry-attempt` on that attempt's fetch. */
  attempt: number;
  fetch: typeof fetch;
};

export function lookupErrorCode(error: LookupErrorShape | null | undefined): string {
  if (!error) return "transient";
  const message = String(error.message ?? "");
  if (/PGRST303/i.test(message) || /jwt claims/i.test(message)) return "PGRST303";
  const code = String(error.code ?? "").trim();
  if (code) return code;
  if (error.status === 0) return "network";
  if (error.status != null) return String(error.status);
  if (error.name) return String(error.name);
  if (message.trim()) return "lookup_error";
  return "transient";
}

function isNetworkLookup(error: LookupErrorShape): boolean {
  const name = String(error.name ?? "");
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (name === "TypeError" || name === "FetchError" || name === "NetworkError") return true;
  if (code === "TypeError" || code === "FetchError" || code === "NetworkError") return true;
  return /fetch failed|network error|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket hang up/i.test(
    `${name} ${code} ${message}`,
  );
}

/** PGRST303, HTTP 5xx, and network failures. Other codes are final. */
export function isTransientLookup(error: LookupErrorShape | null | undefined): boolean {
  if (!error) return false;
  if (lookupErrorCode(error).toUpperCase() === "PGRST303") return true;
  const status = error.status;
  if (typeof status === "number" && (status === 0 || (status >= 500 && status <= 599))) return true;
  const code = lookupErrorCode(error);
  if (/^[5]\d\d$/.test(code)) return true;
  return isNetworkLookup(error);
}

export function isTransientThrown(error: unknown): boolean {
  if (error instanceof TransientError) return true;
  if (!error || typeof error !== "object") return true;
  if (error instanceof TypeError) return true;
  return isTransientLookup(error as LookupErrorShape);
}

/**
 * Next.js memoizes GET fetches with the same URL and headers for the whole
 * server request, and that key does not include `cache`. Each attempt needs
 * its own header or a retry replays the first 401 without leaving the process.
 */
export function fetchForAttempt(attempt: number, baseFetch: typeof fetch = globalThis.fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
    );
    headers.set(RETRY_ATTEMPT_HEADER, String(attempt));
    return baseFetch(input, {
      ...init,
      headers,
      cache: "no-store",
    });
  };
}

/**
 * maybeSingle: no error + null data is a confirmed miss.
 * Any PostgREST/network error is not "not a member".
 */
export function classifyMaybeSingle<T>(result: MaybeSingleResult<T>): LookupClassified<T> {
  const error = errorWithStatus(result);
  if (error) {
    return { kind: "error", code: lookupErrorCode(error) };
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

function errorWithStatus(result: MaybeSingleResult<unknown>): LookupErrorShape | null {
  if (!result.error) return null;
  if (result.error.status != null || result.status == null) return result.error;
  return { ...result.error, status: result.status };
}

function throwNonTransient(error: LookupErrorShape | null | undefined, code: string): never {
  const message = String(error?.message ?? "").trim() || code;
  const failure = new Error(message);
  failure.name = "LookupError";
  throw failure;
}

export async function fetchMaybeSingleWithRetry<T>(
  run: (attempt: MembershipRetryAttempt) => Promise<MaybeSingleResult<T>>,
  opts?: {
    sleep?: (ms: number) => Promise<void>;
    /** Underlying fetch. Each attempt wraps it with a distinct marker and `cache: "no-store"`. */
    fetch?: typeof fetch;
  },
): Promise<T | null> {
  const sleep = opts?.sleep ?? defaultSleep;
  const baseFetch = opts?.fetch ?? globalThis.fetch;
  const attempts = 1 + MEMBERSHIP_RETRY_BACKOFF_MS.length;
  let lastCode = "transient";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const wait = MEMBERSHIP_RETRY_BACKOFF_MS[attempt - 1] ?? MEMBERSHIP_RETRY_BACKOFF_MS.at(-1)!;
      await sleep(wait);
    }

    const attemptNumber = attempt + 1;
    const attemptFetch = fetchForAttempt(attemptNumber, baseFetch);

    let result: MaybeSingleResult<T>;
    try {
      result = await run({ attempt: attemptNumber, fetch: attemptFetch });
    } catch (error) {
      if (error instanceof TransientError || !isTransientThrown(error)) throw error;
      lastCode = classifyThrownLookup(error);
      continue;
    }

    const classified = classifyMaybeSingle(result);
    if (classified.kind === "row") return classified.row;
    if (classified.kind === "no_row") return null;
    const failure = errorWithStatus(result);
    if (!failure || !isTransientLookup(failure)) {
      throwNonTransient(failure, classified.code);
    }
    lastCode = classified.code;
  }

  throw new TransientError(lastCode);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
