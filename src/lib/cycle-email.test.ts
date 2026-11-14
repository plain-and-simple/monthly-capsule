import { describe, expect, it } from "vitest";
import {
  CYCLE_REMINDER_LEAD_DAYS,
  DEFAULT_EMAIL_DAY,
  DEFAULT_SUBMIT_END_DAY,
  DEFAULT_SUBMIT_START_DAY,
} from "./constants";
import {
  CYCLE_EMAIL_BUTTON,
  OPEN_EMAIL_CHECKBOX,
  OPEN_EMAIL_NOTE,
  OPEN_EMAIL_SUBJECT,
  REMINDER_EMAIL_CHECKBOX,
  REMINDER_EMAIL_NOTE,
  REMINDER_EMAIL_SUBJECT,
} from "./copy";
import {
  cycleEmailDueDate,
  cycleReminderChicagoDate,
  defaultScheduleDays,
  dueCycleEmailYearMonths,
  letterPath,
  memberNeedsCycleEmail,
  openEmailHtml,
  openEmailSubject,
  openEmailText,
  parseScheduleCatchUpForm,
  planCycleEmailMembers,
  reminderEmailHtml,
  reminderEmailSubject,
  reminderEmailText,
  scheduleCatchUpPrompts,
  shouldSendCatchUpNow,
  submittedMemberIds,
} from "./cycle-email";
import { cycleOpenChicagoDate } from "./schedule";

const chicago = (isoUtc: string) => new Date(isoUtc);

const defaults = defaultScheduleDays();

const wrap = {
  submit_start_day: 25,
  submit_end_day: 5,
  email_day: 9,
};

const group = {
  ...defaults,
  force_open_year_month: null,
};

describe("open and reminder send days", () => {
  it("uses default start day 1 and reminds two days before close 8", () => {
    expect(DEFAULT_SUBMIT_START_DAY).toBe(1);
    expect(DEFAULT_SUBMIT_END_DAY).toBe(8);
    expect(DEFAULT_EMAIL_DAY).toBe(9);
    expect(CYCLE_REMINDER_LEAD_DAYS).toBe(2);
    expect(cycleEmailDueDate("open", "2026-09", defaults)).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
    expect(cycleReminderChicagoDate("2026-09", defaults.submit_end_day)).toEqual({
      year: 2026,
      month: 9,
      day: 6,
    });
    expect(dueCycleEmailYearMonths("open", defaults, chicago("2026-09-01T17:00:00Z"))).toEqual([
      "2026-09",
    ]);
    expect(dueCycleEmailYearMonths("open", defaults, chicago("2026-09-02T17:00:00Z"))).toEqual([]);
    expect(dueCycleEmailYearMonths("reminder", defaults, chicago("2026-09-06T17:00:00Z"))).toEqual([
      "2026-09",
    ]);
    expect(dueCycleEmailYearMonths("reminder", defaults, chicago("2026-09-07T17:00:00Z"))).toEqual(
      [],
    );
  });

  it("honors a previous-month custom open and a current-month close", () => {
    expect(cycleOpenChicagoDate("2026-09", wrap.submit_start_day)).toEqual({
      year: 2026,
      month: 8,
      day: 25,
    });
    expect(cycleEmailDueDate("open", "2026-09", wrap)).toEqual({
      year: 2026,
      month: 8,
      day: 25,
    });
    expect(cycleEmailDueDate("reminder", "2026-09", wrap)).toEqual({
      year: 2026,
      month: 9,
      day: 3,
    });
    expect(dueCycleEmailYearMonths("open", wrap, chicago("2026-08-25T17:00:00Z"))).toEqual([
      "2026-09",
    ]);
    expect(dueCycleEmailYearMonths("open", wrap, chicago("2026-09-01T17:00:00Z"))).toEqual([]);
    expect(dueCycleEmailYearMonths("reminder", wrap, chicago("2026-09-03T17:00:00Z"))).toEqual([
      "2026-09",
    ]);
  });

  it("places days 20–31 in the prior month and clamps short months", () => {
    expect(
      cycleEmailDueDate("open", "2026-05", { submit_start_day: 20, submit_end_day: 8, email_day: 9 }),
    ).toEqual({ year: 2026, month: 4, day: 20 });
    expect(
      cycleEmailDueDate("open", "2026-05", { submit_start_day: 31, submit_end_day: 8, email_day: 9 }),
    ).toEqual({ year: 2026, month: 4, day: 30 });
    expect(
      cycleEmailDueDate("open", "2026-03", { submit_start_day: 31, submit_end_day: 8, email_day: 9 }),
    ).toEqual({ year: 2026, month: 2, day: 28 });
    expect(
      cycleEmailDueDate("open", "2028-03", { submit_start_day: 31, submit_end_day: 8, email_day: 9 }),
    ).toEqual({ year: 2028, month: 2, day: 29 });
    expect(
      dueCycleEmailYearMonths(
        "open",
        { submit_start_day: 31, submit_end_day: 8, email_day: 9 },
        chicago("2026-04-30T17:00:00Z"),
      ),
    ).toEqual(["2026-05"]);
    expect(
      dueCycleEmailYearMonths(
        "open",
        { submit_start_day: 31, submit_end_day: 8, email_day: 9 },
        chicago("2026-02-28T18:00:00Z"),
      ),
    ).toEqual(["2026-03"]);
    expect(
      dueCycleEmailYearMonths(
        "open",
        { submit_start_day: 31, submit_end_day: 8, email_day: 9 },
        chicago("2028-02-29T18:00:00Z"),
      ),
    ).toEqual(["2028-03"]);
  });

  it("rolls reminder and open across month and year edges", () => {
    expect(cycleReminderChicagoDate("2026-05", 1)).toEqual({ year: 2026, month: 4, day: 29 });
    expect(cycleReminderChicagoDate("2026-03", 1)).toEqual({ year: 2026, month: 2, day: 27 });
    expect(cycleReminderChicagoDate("2026-01", 1)).toEqual({ year: 2025, month: 12, day: 30 });
    expect(
      dueCycleEmailYearMonths(
        "reminder",
        { submit_start_day: 1, submit_end_day: 1, email_day: 2 },
        chicago("2026-04-29T17:00:00Z"),
      ),
    ).toEqual(["2026-05"]);
    expect(
      dueCycleEmailYearMonths(
        "open",
        { submit_start_day: 25, submit_end_day: 8, email_day: 9 },
        chicago("2026-12-25T18:00:00Z"),
      ),
    ).toEqual(["2027-01"]);
    expect(dueCycleEmailYearMonths("open", defaults, chicago("2027-01-01T18:00:00Z"))).toEqual([
      "2027-01",
    ]);
  });

  it("can send open for next month and reminder for this month on the same day", () => {
    const overlap = { submit_start_day: 25, submit_end_day: 27, email_day: 28 };
    const now = chicago("2026-09-25T17:00:00Z");
    expect(dueCycleEmailYearMonths("open", overlap, now)).toEqual(["2026-10"]);
    expect(dueCycleEmailYearMonths("reminder", overlap, now)).toEqual(["2026-09"]);
  });

  it("does not send for a compiled month unless force-open is still active", () => {
    const now = chicago("2026-09-01T17:00:00Z");
    expect(dueCycleEmailYearMonths("open", defaults, now, ["2026-09"])).toEqual([]);
    expect(
      dueCycleEmailYearMonths("open", defaults, now, ["2026-09"], "2026-09"),
    ).toEqual(["2026-09"]);
  });
});

describe("once-only stamps and reminder targeting", () => {
  const members = [{ id: "ada" }, { id: "bess" }, { id: "wren" }];

  it("skips a member who already has that stamp, even if dates change", () => {
    expect(memberNeedsCycleEmail(null)).toBe(true);
    expect(memberNeedsCycleEmail("2026-09-01T15:00:00.000Z")).toBe(false);
    expect(
      planCycleEmailMembers({
        kind: "open",
        members,
        sends: [
          {
            member_id: "ada",
            open_email_sent_at: "2026-09-01T15:00:00.000Z",
            reminder_email_sent_at: null,
          },
        ],
      }),
    ).toEqual(["bess", "wren"]);
    expect(
      planCycleEmailMembers({
        kind: "open",
        members,
        sends: [
          {
            member_id: "ada",
            open_email_sent_at: "2026-09-01T15:00:00.000Z",
            reminder_email_sent_at: null,
          },
        ],
      }),
    ).not.toContain("ada");
  });

  it("reminds only people who have not submitted, and still respects stamps", () => {
    const submissions = [
      { member_id: "ada", status: "submitted" as const },
      { member_id: "bess", status: "draft" as const },
    ];
    expect(submittedMemberIds(submissions)).toEqual(["ada"]);
    expect(
      planCycleEmailMembers({
        kind: "reminder",
        members,
        sends: [
          {
            member_id: "wren",
            open_email_sent_at: null,
            reminder_email_sent_at: "2026-09-06T15:00:00.000Z",
          },
        ],
        submittedMemberIds: submittedMemberIds(submissions),
      }),
    ).toEqual(["bess"]);
    expect(
      planCycleEmailMembers({
        kind: "open",
        members,
        sends: [],
        submittedMemberIds: submittedMemberIds(submissions),
      }),
    ).toEqual(["ada", "bess", "wren"]);
  });
});

describe("date-change catch-up checkboxes", () => {
  it("shows the open prompt when the new open day is today or in the past and unsent", () => {
    const during = chicago("2026-09-05T17:00:00Z");
    expect(
      scheduleCatchUpPrompts({
        group,
        closedYearMonths: [],
        sent: {},
        now: chicago("2026-09-01T17:00:00Z"),
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: true, promptReminder: false });
    expect(
      scheduleCatchUpPrompts({
        group,
        closedYearMonths: [],
        sent: {},
        now: during,
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: true, promptReminder: false });
    expect(
      scheduleCatchUpPrompts({
        group: { ...group, submit_start_day: 10, submit_end_day: 15, email_day: 16 },
        closedYearMonths: [],
        sent: {},
        now: during,
      }),
    ).toEqual({ yearMonth: null, promptOpen: false, promptReminder: false });
  });

  it("shows the reminder prompt when the reminder day is today or past and unsent", () => {
    expect(
      scheduleCatchUpPrompts({
        group,
        closedYearMonths: [],
        sent: {},
        now: chicago("2026-09-06T17:00:00Z"),
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: true, promptReminder: true });
    expect(
      scheduleCatchUpPrompts({
        group,
        closedYearMonths: [],
        sent: { "2026-09": { open: true, reminder: false } },
        now: chicago("2026-09-07T17:00:00Z"),
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: false, promptReminder: true });
  });

  it("hides prompts after a send so changing dates cannot re-send", () => {
    const now = chicago("2026-09-05T17:00:00Z");
    expect(
      scheduleCatchUpPrompts({
        group,
        closedYearMonths: [],
        sent: { "2026-09": { open: true, reminder: true } },
        now,
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: false, promptReminder: false });
    expect(
      scheduleCatchUpPrompts({
        group: { ...group, submit_start_day: 2, submit_end_day: 8, email_day: 9 },
        closedYearMonths: [],
        sent: { "2026-09": { open: true, reminder: false } },
        now,
      }),
    ).toMatchObject({ promptOpen: false });
  });

  it("uses previous-month open for wraparound catch-up prompts", () => {
    expect(
      scheduleCatchUpPrompts({
        group: { ...wrap, force_open_year_month: null },
        closedYearMonths: [],
        sent: {},
        now: chicago("2026-08-25T17:00:00Z"),
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: true, promptReminder: false });
    expect(
      scheduleCatchUpPrompts({
        group: { ...wrap, force_open_year_month: null },
        closedYearMonths: [],
        sent: { "2026-09": { open: true, reminder: false } },
        now: chicago("2026-09-03T17:00:00Z"),
      }),
    ).toEqual({ yearMonth: "2026-09", promptOpen: false, promptReminder: true });
  });

  it("sends immediately only when the prompt is showing and the box is checked", () => {
    expect(shouldSendCatchUpNow(true, true)).toBe(true);
    expect(shouldSendCatchUpNow(true, false)).toBe(false);
    expect(shouldSendCatchUpNow(false, true)).toBe(false);
    expect(shouldSendCatchUpNow(false, false)).toBe(false);
  });

  it("reads unchecked boxes as a no-op and checked boxes as send", () => {
    const empty = new FormData();
    expect(parseScheduleCatchUpForm(empty)).toEqual({ sendOpen: false, sendReminder: false });
    const checked = new FormData();
    checked.set("send_open_email", "1");
    checked.set("send_reminder_email", "1");
    expect(parseScheduleCatchUpForm(checked)).toEqual({ sendOpen: true, sendReminder: true });
  });
});

describe("open and reminder email copy", () => {
  it("uses a write-your-letter button and never includes a letter body", () => {
    expect(openEmailSubject()).toBe(OPEN_EMAIL_SUBJECT);
    expect(reminderEmailSubject()).toBe(REMINDER_EMAIL_SUBJECT);
    expect(CYCLE_EMAIL_BUTTON).toBe("Write your letter");
    expect(OPEN_EMAIL_NOTE).toMatch(/open email hasn't gone out/i);
    expect(OPEN_EMAIL_CHECKBOX).toBe("Email the group that it's open");
    expect(REMINDER_EMAIL_NOTE).toBe("The reminder hasn't gone out");
    expect(REMINDER_EMAIL_CHECKBOX).toBe(
      "Send the reminder now to members who haven't submitted.",
    );
    expect(letterPath("11111111-1111-4111-8111-111111111111")).toBe(
      "/g/11111111-1111-4111-8111-111111111111/submit",
    );

    const link = "https://capsule.plainandsimple.app/g/x/submit";
    const html = openEmailHtml({
      groupName: "Cedar Street",
      monthLabel: "September 2026",
      link,
    });
    expect(html).toContain("Write your letter");
    expect(html).toContain(link);
    expect(html).toContain("display:inline-block");
    expect(html).toContain("#24473c");
    expect(html).not.toContain("The plum tree");

    const reminder = reminderEmailHtml({
      groupName: "Cedar Street",
      monthLabel: "September 2026",
      link,
      closeLabel: "Sep 8, 2026",
    });
    expect(reminder).toContain("Sep 8, 2026");
    expect(reminder).toContain("Write your letter");
    expect(reminderEmailText({ groupName: "Cedar Street", monthLabel: "September 2026", link, closeLabel: "Sep 8, 2026" })).toContain(
      "Submissions close on Sep 8, 2026.",
    );
    expect(openEmailText({ groupName: "Cedar Street", monthLabel: "September 2026", link })).toContain(
      `Write your letter: ${link}`,
    );
  });
});
