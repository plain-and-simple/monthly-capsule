import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXISTS,
  ACCOUNT_FIELDS,
  EMAIL_INVALID,
  EMAIL_REQUIRED,
  FORBIDDEN_ACCOUNT_FIELDS,
  JOIN_ACCOUNT_REQUIRED,
  LOGIN_WRONG,
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT,
  PREFERRED_NAME_REQUIRED,
  SUBMIT_ACCOUNT_REQUIRED,
  accountShapeHasForbiddenField,
  manageDestination,
  managePath,
  membershipHasAccount,
  membershipListedForAccount,
  parseCreateAccount,
  parseEmail,
  parseJoinIntent,
  parseManageLogin,
  parsePreferredName,
  passwordError,
  peoplePreferredNames,
  submitBlockedReason,
  wantsSaveLogin,
} from "./account";
import { hashPassword, verifyPassword } from "./password";

describe("GWT A — Manage is email + password, no SMS", () => {
  it("account fields are preferred_name, email, password", () => {
    expect([...ACCOUNT_FIELDS]).toEqual(["preferred_name", "email", "password"]);
    expect(accountShapeHasForbiddenField(ACCOUNT_FIELDS)).toBe(false);
    expect(FORBIDDEN_ACCOUNT_FIELDS).toContain("phone");
    expect(FORBIDDEN_ACCOUNT_FIELDS).toContain("sms");
    expect(accountShapeHasForbiddenField(["phone"])).toBe(true);
    expect(accountShapeHasForbiddenField(["sms"])).toBe(true);
  });

  it("Manage login is email and password only", () => {
    expect(parseManageLogin({ email: "ada@example.com", password: "secret123" })).toEqual({
      email: "ada@example.com",
      password: "secret123",
    });
    expect(parseManageLogin({ email: "  Ada@Example.com ", password: "secret123" })).toEqual({
      email: "ada@example.com",
      password: "secret123",
    });
    expect(parseManageLogin({ email: "", password: "secret123" })).toEqual({
      error: LOGIN_WRONG,
    });
    expect(parseManageLogin({ email: "ada@example.com", password: "" })).toEqual({
      error: LOGIN_WRONG,
    });
  });

  it("0 groups → empty; 1 → group home; many → pick list", () => {
    expect(manageDestination([])).toEqual({ kind: "empty" });
    expect(managePath({ kind: "empty" })).toBe("/manage");
    expect(manageDestination(["g1"])).toEqual({ kind: "one", groupId: "g1" });
    expect(managePath({ kind: "one", groupId: "g1" })).toBe("/g/g1");
    expect(manageDestination(["g1", "g2"])).toEqual({ kind: "many" });
    expect(managePath({ kind: "many" })).toBe("/manage");
  });
});

describe("GWT B — Create requires preferred_name + email + password", () => {
  it("rejects missing preferred_name, email, or short password", () => {
    expect(
      parseCreateAccount({ preferred_name: "", email: "ada@example.com", password: "secret123" }),
    ).toEqual({ error: PREFERRED_NAME_REQUIRED });
    expect(
      parseCreateAccount({ preferred_name: "Ada", email: "", password: "secret123" }),
    ).toEqual({ error: EMAIL_REQUIRED });
    expect(
      parseCreateAccount({ preferred_name: "Ada", email: "not-an-email", password: "secret123" }),
    ).toEqual({ error: EMAIL_INVALID });
    expect(
      parseCreateAccount({ preferred_name: "Ada", email: "ada@example.com", password: "short" }),
    ).toEqual({ error: PASSWORD_TOO_SHORT });
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordError("1234567")).toBe(PASSWORD_TOO_SHORT);
    expect(passwordError("12345678")).toBeNull();
  });

  it("accepts a complete account and hashes the password", async () => {
    const parsed = parseCreateAccount({
      preferred_name: "  Ada ",
      email: "Ada@Example.com",
      password: "secret123",
    });
    expect(parsed).toEqual({
      preferredName: "Ada",
      email: "ada@example.com",
      password: "secret123",
    });
    const hashed = await hashPassword("secret123");
    expect(hashed).not.toBe("secret123");
    expect(await verifyPassword("secret123", hashed)).toBe(true);
    expect(await verifyPassword("wrong", hashed)).toBe(false);
    expect(ACCOUNT_EXISTS).toBe("That email already has an account.");
  });
});

describe("GWT C — Join is an account, never a PIN-only seat that can submit", () => {
  it("join collects preferred name only; a seat without account_id cannot submit", () => {
    expect(parseJoinIntent({ preferred_name: "Bess" })).toEqual({ preferredName: "Bess" });
    expect(parseJoinIntent({ preferred_name: "" })).toEqual({ error: PREFERRED_NAME_REQUIRED });
    expect(JOIN_ACCOUNT_REQUIRED).toBe("Create an account or sign in first.");
    expect(membershipHasAccount({ account_id: null })).toBe(false);
    expect(submitBlockedReason({ account_id: null })).toBe(SUBMIT_ACCOUNT_REQUIRED);
    expect(membershipListedForAccount({ account_id: null }, "acct-1")).toBe(false);
    expect(wantsSaveLogin(undefined)).toBe(false);
  });
});

describe("GWT D — Signed-in join links the membership", () => {
  it("a saved account can join; leftover seats must save a login before submit", () => {
    expect(parseJoinIntent({ preferred_name: "  Bess " })).toEqual({ preferredName: "Bess" });
    expect(membershipHasAccount({ account_id: "acct-1" })).toBe(true);
    expect(submitBlockedReason({ account_id: "acct-1" })).toBeNull();
    expect(membershipListedForAccount({ account_id: "acct-1" }, "acct-1")).toBe(true);
    expect(membershipListedForAccount({ account_id: "acct-2" }, "acct-1")).toBe(false);
    expect(wantsSaveLogin("1")).toBe(true);
    expect(SUBMIT_ACCOUNT_REQUIRED).toMatch(/email and password/i);
  });
});

describe("GWT E — People shows preferred_name only", () => {
  it("strips email and never uses first/last or phone", () => {
    const directory = peoplePreferredNames([
      { preferred_name: "Ada", email: "ada@example.com" },
      { preferred_name: "Bess", email: "bess@example.com" },
    ]);
    expect(directory).toEqual([
      { preferred_name: "Ada" },
      { preferred_name: "Bess" },
    ]);
    expect(directory.some((row) => "email" in row)).toBe(false);
    expect(parsePreferredName("Ada")).toBe("Ada");
    expect(parsePreferredName("")).toBeNull();
    expect(parseEmail("ada@example.com")).toBe("ada@example.com");
  });
});
