import { describe, expect, it } from "vitest";
import {
  CYCLE_ALREADY_OPEN,
  CYCLE_ALREADY_SENT,
  CYCLE_CONFIRM_CLOSE,
  CYCLE_EMAIL_TIMEOUT,
  CYCLE_OPEN_NOT_ALLOWED,
  CYCLE_OWNER_ONLY,
  CYCLE_VERSION_CAP,
  confirmResendAccepted,
  decideForceClose,
  decideForceEmail,
  decideForceOpen,
  decideForceSkip,
  forceCloseTarget,
  forceCloseYearMonth,
  forceOpenStillActive,
  isCycleSubmitOpen,
  isNextRedirectError,
  openSubmitYearMonth,
  type CycleGroup,
} from "./cycle";
import { CYCLE_OPEN_EARLY, cycleReopenNewVersion } from "./copy";
import { acceptForceOpenYearMonth, allowedForceOpenYearMonths, nextCycleYearMonth } from "./group-status";
import { planForceOpen, type CycleMonthRow } from "./month-version";
import { capsuleMonthLabel } from "./schedule";

const schedule: CycleGroup = {
  submit_start_day: 1,
  submit_end_day: 8,
  email_day: 9,
  force_open_year_month: null,
};

const lateStart: CycleGroup = {
  submit_start_day: 10,
  submit_end_day: 15,
  email_day: 16,
  force_open_year_month: null,
};

// 2026-09 is CDT (UTC−5)
const chicago = (isoUtc: string) => new Date(isoUtc);
const duringWindow = chicago("2026-09-05T17:00:00Z"); // Sept 5
const afterWindow = chicago("2026-09-09T05:30:00Z"); // Sept 9
const beforeLateStart = chicago("2026-09-08T17:00:00Z"); // Sept 8, start=10

describe("F1 force open when closed", () => {
  it("opens the next cycle after the window ends, not this month", () => {
    expect(isCycleSubmitOpen(schedule, [], afterWindow)).toBe(false);
    expect(nextCycleYearMonth(schedule, afterWindow, [])).toBe("2026-10");
    expect(nextCycleYearMonth(schedule, afterWindow, ["2026-09"])).toBe("2026-10");
  });

  it("opens this cycle while still waiting for submit_start_day", () => {
    expect(isCycleSubmitOpen(lateStart, [], beforeLateStart)).toBe(false);
    expect(nextCycleYearMonth(lateStart, beforeLateStart, [])).toBe("2026-09");
  });

  it("opens the December cycle on Nov 22 when writing starts on the 29th", () => {
    const wrapOpen: CycleGroup = {
      submit_start_day: 29,
      submit_end_day: 5,
      email_day: 6,
      force_open_year_month: null,
    };
    const nov22 = chicago("2026-11-22T18:00:00Z");
    expect(isCycleSubmitOpen(wrapOpen, [], nov22)).toBe(false);
    expect(nextCycleYearMonth(wrapOpen, nov22, [])).toBe("2026-12");
    expect(nextCycleYearMonth(wrapOpen, nov22, [])).not.toBe("2026-11");
    const allowed = allowedForceOpenYearMonths(wrapOpen, [], nov22);
    expect(allowed.nextYearMonth).toBe("2026-12");
    expect(allowed.reopenYearMonth).toBeNull();
    expect(acceptForceOpenYearMonth("2026-11", allowed)).toBeNull();
  });

  it("lets members submit to a force-opened current month after the window", () => {
    const opened: CycleGroup = { ...schedule, force_open_year_month: "2026-09" };
    expect(openSubmitYearMonth(opened, ["2026-09"], afterWindow)).toBe("2026-09");
    expect(isCycleSubmitOpen(opened, ["2026-09"], afterWindow)).toBe(true);
  });
});

describe("F2 already open — same-month versions, not next month", () => {
  it("is already open in the calendar window", () => {
    expect(isCycleSubmitOpen(schedule, [], duringWindow)).toBe(true);
    expect(openSubmitYearMonth(schedule, [], duringWindow)).toBe("2026-09");
    expect(decideForceOpen("owner", true)).toBe("already_open");
    expect(CYCLE_ALREADY_OPEN).toBe("Already open.");
  });

  it("is already open after a force-open of this month", () => {
    const opened: CycleGroup = { ...schedule, force_open_year_month: "2026-09" };
    expect(decideForceOpen("owner", isCycleSubmitOpen(opened, [], afterWindow))).toBe(
      "already_open",
    );
  });

  it("after the window, the next cycle is a new v1 and the compiled month can be a v2", () => {
    const rows: CycleMonthRow[] = [{ year_month: "2026-09", version: 1, status: "compiled" }];
    const allowed = allowedForceOpenYearMonths(schedule, rows, afterWindow);
    expect(allowed.nextYearMonth).toBe("2026-10");
    expect(allowed.reopenYearMonth).toBe("2026-09");
    expect(planForceOpen(rows, allowed.nextYearMonth)).toEqual({ action: "create", version: 1 });
    expect(planForceOpen(rows, "2026-09")).toEqual({ action: "create", version: 2 });
    expect(CYCLE_VERSION_CAP).toBe("This month cannot take another version.");
  });

  it("versions that cycle when the close is still ahead", () => {
    const yearMonth = nextCycleYearMonth(schedule, duringWindow, []);
    expect(yearMonth).toBe("2026-09");
    expect(
      planForceOpen([{ year_month: yearMonth, version: 1, status: "compiled" }], yearMonth),
    ).toEqual({ action: "create", version: 2 });
  });
});

describe("F3 / F7 non-owner reject", () => {
  it("rejects force open", () => {
    expect(decideForceOpen("member", false)).toBe("forbidden");
    expect(CYCLE_OWNER_ONLY).toBe("Owner only.");
  });

  it("rejects force close even if confirmed", () => {
    expect(decideForceClose("member", true)).toBe("forbidden");
    expect(decideForceClose("owner", false)).toBe("unconfirmed");
    expect(CYCLE_CONFIRM_CLOSE).toBe("Confirm to close.");
    expect(decideForceClose("owner", true)).toBe("ok");
  });

  it("rejects email send and skip", () => {
    expect(decideForceEmail("member", { email_sent_at: null })).toBe("forbidden");
    expect(decideForceSkip("member", { email_sent_at: null })).toBe("forbidden");
  });
});

describe("F4 force close compiles the open period", () => {
  it("closes a naturally open month", () => {
    expect(forceCloseYearMonth(schedule, [], duringWindow)).toBe("2026-09");
  });

  it("closes a force-opened current month after the window", () => {
    const opened: CycleGroup = { ...schedule, force_open_year_month: "2026-09" };
    expect(forceCloseYearMonth(opened, [], afterWindow)).toBe("2026-09");
    expect(
      forceCloseTarget(
        opened,
        [{ year_month: "2026-09", version: 2, status: "open" }],
        [],
        afterWindow,
      ),
    ).toEqual({ yearMonth: "2026-09", version: 2 });
  });

  it("compiles the cron target when already closed (idempotent month)", () => {
    expect(forceCloseYearMonth(schedule, [], afterWindow)).toBe("2026-09");
  });

  it("does not reopen a force-closed month on remaining calendar days", () => {
    expect(openSubmitYearMonth(schedule, ["2026-09"], duringWindow)).toBeNull();
    expect(isCycleSubmitOpen(schedule, ["2026-09"], duringWindow)).toBe(false);
  });
});

describe("F5 / F6 email send vs skip", () => {
  it("owner can send once; already sent needs confirm to resend", () => {
    expect(decideForceEmail("owner", { email_sent_at: null })).toBe("send");
    expect(decideForceEmail("owner", { email_sent_at: "2026-09-09T12:00:00Z" })).toBe(
      "already_sent",
    );
    expect(decideForceEmail("owner", { email_sent_at: "2026-09-09T12:00:00Z" }, true)).toBe(
      "resend",
    );
    expect(CYCLE_ALREADY_SENT).toBe("Already emailed — confirm Send again to resend.");
  });

  it("Not now holds; missing capsule cannot skip", () => {
    expect(decideForceSkip("owner", { email_sent_at: null })).toBe("hold");
    expect(decideForceSkip("owner", { email_sent_at: "2026-09-09T12:00:00Z" })).toBe(
      "already_sent",
    );
    expect(decideForceEmail("owner", null)).toBe("no_capsule");
    expect(decideForceSkip("owner", null)).toBe("no_capsule");
    expect(confirmResendAccepted("1")).toBe(true);
    expect(confirmResendAccepted("0")).toBe(false);
  });
});

describe("server action errors must not spin the owner UI forever", () => {
  it("rethrows only Next.js redirects, not other digest errors", () => {
    expect(isNextRedirectError({ digest: "NEXT_REDIRECT;replace;/join/x;307;" })).toBe(true);
    expect(isNextRedirectError({ digest: "abc123@E394" })).toBe(false);
    expect(isNextRedirectError(new Error("Resend failed"))).toBe(false);
    expect(CYCLE_EMAIL_TIMEOUT).toBe("Email send timed out. Try again.");
  });
});

describe("F8 no force — calendar path unchanged", () => {
  it("open/close match isSubmitOpen calendar days", () => {
    expect(isCycleSubmitOpen(schedule, [], duringWindow)).toBe(true);
    expect(isCycleSubmitOpen(schedule, [], afterWindow)).toBe(false);
    expect(isCycleSubmitOpen(lateStart, [], beforeLateStart)).toBe(false);
  });

  it("force-open of this month stays active after submit_end_day", () => {
    expect(forceOpenStillActive("2026-10", schedule, afterWindow)).toBe(true);
    expect(forceOpenStillActive("2026-09", schedule, afterWindow)).toBe(true);
    expect(forceOpenStillActive("2026-09", schedule, duringWindow)).toBe(true);
    expect(forceOpenStillActive("2026-08", schedule, duringWindow)).toBe(false);
  });
});

describe("previous-month open writes to month M", () => {
  const wrap: CycleGroup = {
    submit_start_day: 25,
    submit_end_day: 5,
    email_day: 9,
    force_open_year_month: null,
  };
  const inPrevMonth = chicago("2026-09-26T17:00:00Z"); // Sep 26 → October cycle
  const inCycleMonth = chicago("2026-10-03T17:00:00Z"); // Oct 3
  const afterClose = chicago("2026-10-06T05:30:00Z"); // Oct 6

  it("opens October while still in September when start is 25", () => {
    expect(openSubmitYearMonth(wrap, [], inPrevMonth)).toBe("2026-10");
    expect(isCycleSubmitOpen(wrap, [], inPrevMonth)).toBe(true);
  });

  it("stays on October through submit_end_day in October", () => {
    expect(openSubmitYearMonth(wrap, [], inCycleMonth)).toBe("2026-10");
    expect(openSubmitYearMonth(wrap, [], chicago("2026-10-05T17:00:00Z"))).toBe("2026-10");
  });

  it("closes after submit_end_day in month M", () => {
    expect(openSubmitYearMonth(wrap, [], afterClose)).toBeNull();
    expect(isCycleSubmitOpen(wrap, [], afterClose)).toBe(false);
  });

  it("does not reopen a force-closed next month during the wrap", () => {
    expect(openSubmitYearMonth(wrap, ["2026-10"], inPrevMonth)).toBeNull();
  });

  it("opens January from late December when start is 25", () => {
    expect(openSubmitYearMonth(wrap, [], chicago("2026-12-26T18:00:00Z"))).toBe("2027-01");
  });
});

describe("allowed force-open keys", () => {
  const compiled = (yearMonth: string): CycleMonthRow => ({
    year_month: yearMonth,
    version: 1,
    status: "compiled",
  });

  const wrapOpen: CycleGroup = {
    submit_start_day: 29,
    submit_end_day: 5,
    email_day: 6,
    force_open_year_month: null,
  };
  const nov22 = chicago("2026-11-22T18:00:00Z");

  it("offers only the next cycle when nothing is compiled", () => {
    const allowed = allowedForceOpenYearMonths(wrapOpen, [], nov22);
    expect(allowed.nextYearMonth).toBe("2026-12");
    expect(allowed.reopenYearMonth).toBeNull();
    expect(acceptForceOpenYearMonth("2026-11", allowed)).toBeNull();
    expect(acceptForceOpenYearMonth("", allowed)).toBeNull();
    expect(acceptForceOpenYearMonth("  ", allowed)).toBeNull();
    expect(acceptForceOpenYearMonth(null, allowed)).toBeNull();
    expect(acceptForceOpenYearMonth("2027-01", allowed)).toBeNull();
    expect(acceptForceOpenYearMonth("2026-12", allowed)).toBe("2026-12");
    expect(CYCLE_OPEN_NOT_ALLOWED).toBe("That month cannot be opened.");
  });

  it("offers the next cycle and a new version of the month just compiled", () => {
    const rows = [compiled("2026-06"), compiled("2026-11")];
    const allowed = allowedForceOpenYearMonths(wrapOpen, rows, nov22);
    expect(allowed.nextYearMonth).toBe("2026-12");
    expect(allowed.reopenYearMonth).toBe("2026-11");
    expect(planForceOpen(rows, "2026-11")).toEqual({ action: "create", version: 2 });
    expect(planForceOpen(rows, "2026-12")).toEqual({ action: "create", version: 1 });
    expect(acceptForceOpenYearMonth("2026-12", allowed)).toBe("2026-12");
    expect(acceptForceOpenYearMonth("2026-11", allowed)).toBe("2026-11");
    expect(acceptForceOpenYearMonth("2026-06", allowed)).toBeNull();
    expect(acceptForceOpenYearMonth("2026-10", allowed)).toBeNull();
    expect(CYCLE_OPEN_EARLY).toBe("Open next month early");
    expect(cycleReopenNewVersion(capsuleMonthLabel("2026-11"))).toBe(
      "Reopen October 2026 for a new version",
    );
  });

  it("offers that month again after compiled v2, as a new v3", () => {
    const v1: CycleMonthRow = { year_month: "2026-11", version: 1, status: "compiled" };
    const v2: CycleMonthRow = { year_month: "2026-11", version: 2, status: "compiled" };
    const v1Before = { ...v1 };
    expect(planForceOpen([v1], "2026-11")).toEqual({ action: "create", version: 2 });
    expect(v1).toEqual(v1Before);

    const rows = [v1, v2];
    const before = rows.map((row) => ({ ...row }));
    expect(planForceOpen(rows, "2026-11")).toEqual({ action: "create", version: 3 });
    expect(planForceOpen(rows, "2026-11").action).not.toBe("reopen");
    expect(rows).toEqual(before);

    const allowed = allowedForceOpenYearMonths(wrapOpen, rows, nov22);
    expect(allowed.nextYearMonth).toBe("2026-12");
    expect(allowed.reopenYearMonth).toBe("2026-11");
    expect(acceptForceOpenYearMonth("2026-11", allowed)).toBe("2026-11");
  });

  it("offers October and a new September version after a Sep 9 compile", () => {
    const rows = [compiled("2026-09")];
    const allowed = allowedForceOpenYearMonths(schedule, rows, afterWindow);
    expect(allowed.nextYearMonth).toBe("2026-10");
    expect(allowed.reopenYearMonth).toBe("2026-09");
    expect(planForceOpen(rows, "2026-09")).toEqual({ action: "create", version: 2 });
    expect(acceptForceOpenYearMonth("2026-08", allowed)).toBeNull();
  });

  it("offers only this cycle while waiting for submit_start_day", () => {
    const allowed = allowedForceOpenYearMonths(lateStart, [], beforeLateStart);
    expect(allowed.nextYearMonth).toBe("2026-09");
    expect(allowed.reopenYearMonth).toBeNull();
    expect(acceptForceOpenYearMonth("2026-08", allowed)).toBeNull();
  });

  it("does not reopen a compiled month after that Chicago month has ended", () => {
    const allowed = allowedForceOpenYearMonths(wrapOpen, [compiled("2026-06")], nov22);
    expect(allowed.nextYearMonth).toBe("2026-12");
    expect(allowed.reopenYearMonth).toBeNull();
  });

  it("hides reopen when that compiled month cannot take another edition", () => {
    const capped: CycleMonthRow[] = [{ year_month: "2026-11", version: 24, status: "compiled" }];
    expect(allowedForceOpenYearMonths(wrapOpen, capped, nov22).reopenYearMonth).toBeNull();

    const alreadyOpen: CycleMonthRow[] = [
      compiled("2026-11"),
      { year_month: "2026-11", version: 2, status: "open" },
    ];
    expect(allowedForceOpenYearMonths(wrapOpen, alreadyOpen, nov22).reopenYearMonth).toBeNull();
    expect(acceptForceOpenYearMonth("2026-11", allowedForceOpenYearMonths(wrapOpen, alreadyOpen, nov22))).toBeNull();
  });

  it("does not treat a closed or empty month row as a reopen candidate", () => {
    const closedOnly: CycleMonthRow[] = [{ year_month: "2026-11", version: 1, status: "closed" }];
    const allowed = allowedForceOpenYearMonths(wrapOpen, closedOnly, nov22);
    expect(allowed.nextYearMonth).toBe("2026-12");
    expect(allowed.reopenYearMonth).toBeNull();
    expect(acceptForceOpenYearMonth("2026-11", allowed)).toBeNull();
  });
});
