import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREATE_GROUP_CODE,
  STUDIO_CODE_ERROR,
  rejectInvalidStudioCode,
  resolveCreateGroupCode,
  studioCodeMatches,
} from "./studio-code";

describe("resolveCreateGroupCode", () => {
  it("defaults when unset or blank", () => {
    expect(resolveCreateGroupCode(undefined)).toBe(DEFAULT_CREATE_GROUP_CODE);
    expect(resolveCreateGroupCode("")).toBe(DEFAULT_CREATE_GROUP_CODE);
    expect(resolveCreateGroupCode("   ")).toBe(DEFAULT_CREATE_GROUP_CODE);
  });

  it("reads env when set", () => {
    expect(resolveCreateGroupCode("studio-secret")).toBe("studio-secret");
    expect(resolveCreateGroupCode("  studio-secret  ")).toBe("studio-secret");
  });
});

describe("studioCodeMatches", () => {
  it("compares trim and case-insensitively", () => {
    expect(studioCodeMatches("plainandsimple", "plainandsimple")).toBe(true);
    expect(studioCodeMatches("  PlainAndSimple  ", "plainandsimple")).toBe(true);
    expect(studioCodeMatches("PLAINANDSIMPLE", "plainandsimple")).toBe(true);
  });

  it("rejects a missing or wrong code", () => {
    expect(studioCodeMatches("", "plainandsimple")).toBe(false);
    expect(studioCodeMatches("   ", "plainandsimple")).toBe(false);
    expect(studioCodeMatches("nope", "plainandsimple")).toBe(false);
    expect(STUDIO_CODE_ERROR).toBe("That code doesn’t work");
  });
});

describe("rejectInvalidStudioCode", () => {
  it("rejects missing or wrong code with the exact error", () => {
    expect(rejectInvalidStudioCode("", DEFAULT_CREATE_GROUP_CODE)).toEqual({
      ok: false,
      error: "That code doesn’t work",
    });
    expect(rejectInvalidStudioCode("wrong", DEFAULT_CREATE_GROUP_CODE)).toEqual({
      ok: false,
      error: "That code doesn’t work",
    });
  });

  it("allows a matching code after resolve", () => {
    const expected = resolveCreateGroupCode(undefined);
    expect(rejectInvalidStudioCode("plainandsimple", expected)).toBeNull();
    expect(rejectInvalidStudioCode("PlainAndSimple", expected)).toBeNull();
    expect(rejectInvalidStudioCode("  Secret  ", "secret")).toBeNull();
    expect(rejectInvalidStudioCode("plainandsimple", "secret")).toEqual({
      ok: false,
      error: "That code doesn’t work",
    });
  });
});
