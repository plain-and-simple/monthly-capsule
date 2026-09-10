import { describe, expect, it } from "vitest";
import { resolveCapsuleRecipients } from "./recipients";

describe("resolveCapsuleRecipients", () => {
  it("uses members.email when present", () => {
    expect(
      resolveCapsuleRecipients([{ memberEmail: "chanfans@gmail.com", accountEmail: null }]),
    ).toEqual({ emails: ["chanfans@gmail.com"], skippedNoEmail: 0 });
  });

  it("falls back to the linked account email when members.email is null", () => {
    expect(
      resolveCapsuleRecipients([
        { memberEmail: null, accountEmail: "ada@example.com" },
        { memberEmail: "  ", accountEmail: "Bess@Example.com" },
      ]),
    ).toEqual({ emails: ["ada@example.com", "bess@example.com"], skippedNoEmail: 0 });
  });

  it("does not add the account address when the member already has one", () => {
    expect(
      resolveCapsuleRecipients([
        { memberEmail: "seat@example.com", accountEmail: "account@example.com" },
      ]),
    ).toEqual({ emails: ["seat@example.com"], skippedNoEmail: 0 });
  });

  it("dedupes the same address across seats and sources", () => {
    expect(
      resolveCapsuleRecipients([
        { memberEmail: "ChanFans@gmail.com", accountEmail: "chanfans@gmail.com" },
        { memberEmail: null, accountEmail: "chanfans@gmail.com" },
        { memberEmail: "chanfans@gmail.com", accountEmail: null },
      ]),
    ).toEqual({ emails: ["chanfans@gmail.com"], skippedNoEmail: 0 });
  });

  it("counts seats with no usable address as skipped", () => {
    expect(
      resolveCapsuleRecipients([
        { memberEmail: null, accountEmail: null },
        { memberEmail: "not-an-email", accountEmail: "" },
        { memberEmail: "owner@example.com", accountEmail: null },
      ]),
    ).toEqual({ emails: ["owner@example.com"], skippedNoEmail: 2 });
  });
});
