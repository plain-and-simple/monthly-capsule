import { describe, expect, it } from "vitest";
import { EMAIL_INVALID, MIN_PASSWORD_LENGTH, parseEmail, passwordError } from "./account";
import { emailFieldError, passwordFieldError } from "./field-validation";

describe("idle field validation", () => {
  it("does not error on empty values (required handles submit)", () => {
    expect(emailFieldError("")).toBeNull();
    expect(emailFieldError("   ")).toBeNull();
    expect(passwordFieldError("")).toBeNull();
  });

  it("rejects a malformed email and a short password", () => {
    expect(emailFieldError("not-an-email")).toBe(EMAIL_INVALID);
    expect(parseEmail("ada@example.com")).toBe("ada@example.com");
    expect(emailFieldError("ada@example.com")).toBeNull();
    expect(passwordFieldError("short")).toBe(passwordError("short"));
    expect(passwordFieldError("secret123")).toBeNull();
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});
