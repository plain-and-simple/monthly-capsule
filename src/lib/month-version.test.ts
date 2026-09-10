import { describe, expect, it } from "vitest";
import {
  MAX_MONTH_VERSIONS,
  capsuleHref,
  capsulePath,
  capsuleTitle,
  parseCapsuleEditionParam,
  planForceOpen,
  type CycleMonthRow,
} from "./month-version";

const septV1: CycleMonthRow = {
  year_month: "2026-09",
  version: 1,
  status: "compiled",
};

describe("same-month force-open editions", () => {
  it("opens v1 when this month has no row", () => {
    expect(planForceOpen([], "2026-09")).toEqual({ action: "create", version: 1 });
  });

  it("opens v2 after this month is compiled — does not walk to October", () => {
    expect(planForceOpen([septV1], "2026-09")).toEqual({ action: "create", version: 2 });
    expect(planForceOpen([septV1], "2026-09").action).not.toBe("already_open");
  });

  it("reopens a closed-not-compiled edition instead of minting v2", () => {
    expect(
      planForceOpen([{ year_month: "2026-09", version: 1, status: "closed" }], "2026-09"),
    ).toEqual({ action: "reopen", version: 1 });
  });

  it("treats an already-open edition as already open", () => {
    expect(
      planForceOpen(
        [
          septV1,
          { year_month: "2026-09", version: 2, status: "open" },
        ],
        "2026-09",
      ),
    ).toEqual({ action: "already_open", version: 2 });
  });

  it("caps editions instead of inventing a next calendar month", () => {
    expect(
      planForceOpen(
        [{ year_month: "2026-09", version: MAX_MONTH_VERSIONS, status: "compiled" }],
        "2026-09",
      ),
    ).toEqual({ action: "capped", version: MAX_MONTH_VERSIONS });
  });
});

describe("submissions do not roll over", () => {
  it("a new edition is a new version number, so it cannot share month_id with v1", () => {
    const next = planForceOpen([septV1], "2026-09");
    expect(next).toEqual({ action: "create", version: 2 });
    expect(next.version).not.toBe(septV1.version);
  });
});

describe("versioned capsule URLs and labels", () => {
  it("keeps v1 on /capsule/YYYY-MM and puts v2+ in the path", () => {
    expect(capsulePath("2026-09", 1)).toBe("2026-09");
    expect(capsulePath("2026-09", 2)).toBe("2026-09/v2");
    expect(capsuleHref("abc", "2026-09", 3)).toBe("/g/abc/capsule/2026-09/v3");
  });

  it("says v2 in the title only when helpful", () => {
    expect(capsuleTitle("September 2026", 1)).toBe("September 2026");
    expect(capsuleTitle("September 2026", 2)).toBe("September 2026 · v2");
  });

  it("parses /v2 and /2", () => {
    expect(parseCapsuleEditionParam(undefined)).toBe(1);
    expect(parseCapsuleEditionParam("v2")).toBe(2);
    expect(parseCapsuleEditionParam("3")).toBe(3);
    expect(parseCapsuleEditionParam("nope")).toBeNull();
  });
});
