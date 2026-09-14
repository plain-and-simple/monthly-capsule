import { describe, expect, it } from "vitest";
import { resolveCapsuleRecipients } from "./recipients";

describe("resolveCapsuleRecipients", () => {
  it("uses members.email when present", () => {
    expect(
      resolveCapsuleRecipients([
        { preferredName: "Chandler", memberEmail: "chanfans@gmail.com", accountEmail: null },
      ]),
    ).toEqual({
      emails: ["chanfans@gmail.com"],
      skippedNoEmail: 0,
      skippedNames: [],
    });
  });

  it("falls back to the linked account email when members.email is null", () => {
    expect(
      resolveCapsuleRecipients([
        { preferredName: "Ada", memberEmail: null, accountEmail: "ada@example.com" },
        { preferredName: "Bess", memberEmail: "  ", accountEmail: "Bess@Example.com" },
      ]),
    ).toEqual({
      emails: ["ada@example.com", "bess@example.com"],
      skippedNoEmail: 0,
      skippedNames: [],
    });
  });

  it("does not add the account address when the member already has one", () => {
    expect(
      resolveCapsuleRecipients([
        { preferredName: "Seat", memberEmail: "seat@example.com", accountEmail: "account@example.com" },
      ]),
    ).toEqual({ emails: ["seat@example.com"], skippedNoEmail: 0, skippedNames: [] });
  });

  it("dedupes the same address across seats and sources", () => {
    expect(
      resolveCapsuleRecipients([
        { preferredName: "A", memberEmail: "ChanFans@gmail.com", accountEmail: "chanfans@gmail.com" },
        { preferredName: "B", memberEmail: null, accountEmail: "chanfans@gmail.com" },
        { preferredName: "C", memberEmail: "chanfans@gmail.com", accountEmail: null },
      ]),
    ).toEqual({ emails: ["chanfans@gmail.com"], skippedNoEmail: 0, skippedNames: [] });
  });

  it("lists skipped members by name instead of dropping them silently", () => {
    expect(
      resolveCapsuleRecipients([
        { preferredName: "Curtis", memberEmail: null, accountEmail: null },
        { preferredName: "Bess", memberEmail: "not-an-email", accountEmail: "" },
        { preferredName: "Chandler", memberEmail: "owner@example.com", accountEmail: null },
      ]),
    ).toEqual({
      emails: ["owner@example.com"],
      skippedNoEmail: 2,
      skippedNames: ["Curtis", "Bess"],
    });
  });
});
