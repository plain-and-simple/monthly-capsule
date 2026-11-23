import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  classifyMaybeSingle,
  classifyThrownLookup,
  fetchMaybeSingleWithRetry,
  lookupErrorCode,
  MEMBERSHIP_RETRY_BACKOFF_MS,
  RETRY_ATTEMPT_HEADER,
} from "./membership-lookup";
import { isTransientError, TransientError } from "./transient-error";

describe("membership lookup vs no-row", () => {
  it("treats maybeSingle with null data and no error as a confirmed miss", () => {
    expect(classifyMaybeSingle({ data: null, error: null })).toEqual({ kind: "no_row" });
  });

  it("returns the row when data is present", () => {
    expect(classifyMaybeSingle({ data: { id: "member-1" }, error: null })).toEqual({
      kind: "row",
      row: { id: "member-1" },
    });
  });

  it("does not treat PGRST303 / 401 as a miss", () => {
    expect(
      classifyMaybeSingle({
        data: null,
        error: { code: "PGRST303", message: "JWT claims validation failed", status: 401 },
      }),
    ).toEqual({ kind: "error", code: "PGRST303" });
    expect(
      classifyMaybeSingle({
        data: null,
        error: { message: "JWT claims validation failed", status: 401 },
      }),
    ).toEqual({ kind: "error", code: "PGRST303" });
    expect(lookupErrorCode({ status: 500, message: "upstream" })).toBe("500");
  });

  it("retries twice with backoff then throws TransientError on lookup errors", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await expect(
      fetchMaybeSingleWithRetry(
        async () => {
          calls += 1;
          return {
            data: null,
            error: { code: "PGRST303", message: "JWT claims validation failed", status: 401 },
          };
        },
        {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    ).rejects.toSatisfy((error) => isTransientError(error) && error.code === "PGRST303");
    expect(calls).toBe(1 + MEMBERSHIP_RETRY_BACKOFF_MS.length);
    expect(sleeps).toEqual([...MEMBERSHIP_RETRY_BACKOFF_MS]);
  });

  it("returns the row if a later attempt succeeds", async () => {
    let calls = 0;
    const row = await fetchMaybeSingleWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          return { data: null, error: { code: "PGRST303", message: "JWT claims validation failed" } };
        }
        return { data: { id: "member-1" }, error: null };
      },
      { sleep: async () => undefined },
    );
    expect(row).toEqual({ id: "member-1" });
    expect(calls).toBe(2);
  });

  it("does not retry a confirmed no-row", async () => {
    let calls = 0;
    const row = await fetchMaybeSingleWithRetry(
      async () => {
        calls += 1;
        return { data: null, error: null };
      },
      { sleep: async () => undefined },
    );
    expect(row).toBeNull();
    expect(calls).toBe(1);
  });

  it("retries thrown network errors then throws TransientError", async () => {
    let calls = 0;
    await expect(
      fetchMaybeSingleWithRetry(
        async () => {
          calls += 1;
          throw new TypeError("fetch failed");
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toSatisfy((error) => isTransientError(error) && error instanceof TransientError);
    expect(calls).toBe(1 + MEMBERSHIP_RETRY_BACKOFF_MS.length);
    expect(classifyThrownLookup(new TypeError("fetch failed"))).toBe("TypeError");
  });

  it("retries a returned fetch failure from the admin client", async () => {
    let calls = 0;
    await expect(
      fetchMaybeSingleWithRetry(
        async () => {
          calls += 1;
          return { data: null, error: { message: "TypeError: fetch failed" }, status: 0 };
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toSatisfy((error) => isTransientError(error) && error.code === "network");
    expect(calls).toBe(1 + MEMBERSHIP_RETRY_BACKOFF_MS.length);
  });

  it("retries HTTP 5xx then returns the row", async () => {
    let calls = 0;
    const row = await fetchMaybeSingleWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) return { data: null, error: { message: "upstream" }, status: 503 };
        return { data: { id: "member-1" }, error: null };
      },
      { sleep: async () => undefined },
    );
    expect(row).toEqual({ id: "member-1" });
    expect(calls).toBe(2);
  });

  it("does not retry a non-transient lookup error", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    await expect(
      fetchMaybeSingleWithRetry(
        async () => {
          calls += 1;
          return { data: null, error: { code: "42501", message: "permission denied", status: 403 } };
        },
        {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    ).rejects.toSatisfy((error) => error instanceof Error && !isTransientError(error) && error.name === "LookupError");
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("does not retry a thrown non-transient error", async () => {
    let calls = 0;
    await expect(
      fetchMaybeSingleWithRetry(
        async () => {
          calls += 1;
          throw new Error("permission denied");
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow("permission denied");
    expect(calls).toBe(1);
  });
});

describe("admin lookup attempts are distinct fetches", () => {
  it("resolves when the first attempt is PGRST303 and the next succeeds", async () => {
    const seen = recordFetches((attempt) => (attempt === "1" ? pgrst303Response() : memberResponse()));
    const row = await fetchMaybeSingleWithRetry((attempt) => selectMember(attempt.fetch), {
      sleep: async () => undefined,
      fetch: seen.fetch,
    });
    expect(row).toEqual({ id: "member-1" });
    expect(seen.calls).toHaveLength(2);
    expect(seen.calls.map((call) => call.attempt)).toEqual(["1", "2"]);
    expect(new Set(seen.calls.map((call) => call.attempt)).size).toBe(2);
    expect(seen.calls.every((call) => call.cache === "no-store")).toBe(true);
  });

  it("throws TransientError after 3 distinct attempts when PGRST303 persists", async () => {
    const seen = recordFetches(() => pgrst303Response());
    await expect(
      fetchMaybeSingleWithRetry((attempt) => selectMember(attempt.fetch), {
        sleep: async () => undefined,
        fetch: seen.fetch,
      }),
    ).rejects.toSatisfy((error) => isTransientError(error) && error.code === "PGRST303");
    expect(seen.calls.map((call) => call.attempt)).toEqual(["1", "2", "3"]);
    expect(seen.calls.every((call) => call.cache === "no-store")).toBe(true);
  });

  it("does not send a second fetch for a non-transient error", async () => {
    const seen = recordFetches(() => permissionDeniedResponse());
    await expect(
      fetchMaybeSingleWithRetry((attempt) => selectMember(attempt.fetch), {
        sleep: async () => undefined,
        fetch: seen.fetch,
      }),
    ).rejects.toSatisfy((error) => !isTransientError(error));
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0]?.attempt).toBe("1");
  });
});

function recordFetches(handler: (attempt: string | null) => Response): {
  fetch: typeof fetch;
  calls: Array<{ attempt: string | null; cache: RequestCache | undefined }>;
} {
  const calls: Array<{ attempt: string | null; cache: RequestCache | undefined }> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const attempt = new Headers(init?.headers).get(RETRY_ATTEMPT_HEADER);
    calls.push({ attempt, cache: init?.cache });
    return handler(attempt);
  };
  return { fetch: fetchImpl, calls };
}

async function selectMember(attemptFetch: typeof fetch) {
  const admin = createClient("https://example.supabase.co", "service-role-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: attemptFetch },
  });
  const { data, error, status } = await admin.from("members").select("id").eq("id", "member-1").maybeSingle();
  return {
    data,
    error: error ? { message: error.message, code: error.code, name: error.name } : null,
    status,
  };
}

function pgrst303Response(): Response {
  return new Response(
    JSON.stringify({
      code: "PGRST303",
      message: "JWT claims validation failed",
      details: null,
      hint: null,
    }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

function memberResponse(): Response {
  return new Response(JSON.stringify([{ id: "member-1" }]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function permissionDeniedResponse(): Response {
  return new Response(
    JSON.stringify({ code: "42501", message: "permission denied", details: null, hint: null }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}
