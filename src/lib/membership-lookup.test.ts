import { describe, expect, it } from "vitest";
import {
  classifyMaybeSingle,
  classifyThrownLookup,
  fetchMaybeSingleWithRetry,
  lookupErrorCode,
  MEMBERSHIP_RETRY_BACKOFF_MS,
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
});
