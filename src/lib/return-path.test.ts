import { describe, expect, it } from "vitest";
import { inviteJoinPath, parseAuthFormReturn, parseMembershipNext, parseReturnPath } from "./return-path";

const id = "550e8400-e29b-41d4-a716-446655440000";

describe("parseReturnPath", () => {
  it("keeps invite and join context after signup or sign-in", () => {
    expect(parseReturnPath(`/join/${id}`)).toBe(`/join/${id}`);
    expect(parseReturnPath(`/JOIN/${id.toUpperCase()}`)).toBe(`/join/${id}`);
    expect(parseReturnPath("/join")).toBe("/join");
    expect(parseReturnPath("/manage")).toBe("/manage");
    expect(parseReturnPath("/create")).toBe("/create");
  });

  it("auth form return allows home plus the usual next paths", () => {
    expect(parseAuthFormReturn("/")).toBe("/");
    expect(parseAuthFormReturn(`/join/${id}`)).toBe(`/join/${id}`);
    expect(parseAuthFormReturn("/g/" + id)).toBeNull();
  });

  it("rejects off-site or unrelated paths", () => {
    expect(parseReturnPath("https://evil.example/join")).toBeNull();
    expect(parseReturnPath("//evil.example")).toBeNull();
    expect(parseReturnPath("/join/../../../etc")).toBeNull();
    expect(parseReturnPath(`/join/${id}/../manage`)).toBeNull();
    expect(parseReturnPath("/g/" + id)).toBeNull();
    expect(parseReturnPath("")).toBeNull();
    expect(parseReturnPath(" /join ")).toBe("/join");
  });
});

describe("invite and membership next", () => {
  it("builds a join landing path from a group id", () => {
    expect(inviteJoinPath(id)).toBe(`/join/${id}`);
    expect(inviteJoinPath(`https://capsule.plainandsimple.app/join/${id}`)).toBe(`/join/${id}`);
  });

  it("only returns a member to their own group home or submit", () => {
    expect(parseMembershipNext(id, `/g/${id}/submit`)).toBe(`/g/${id}/submit`);
    expect(parseMembershipNext(id, `/g/${id}`)).toBe(`/g/${id}`);
    expect(parseMembershipNext(id, "/g/11111111-1111-4111-8111-111111111111/submit")).toBeNull();
    expect(parseMembershipNext(id, "/join")).toBeNull();
  });
});
