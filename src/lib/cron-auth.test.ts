import { afterEach, describe, expect, it } from "vitest";
import { authorizeCron } from "./cron-auth";

const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

function request(authorization?: string): Request {
  return new Request("https://capsule.plainandsimple.app/api/cron/email", {
    headers: authorization ? { authorization } : {},
  });
}

describe("authorizeCron", () => {
  it("rejects a missing secret or header", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(request("Bearer secret"))).toBe(false);
    process.env.CRON_SECRET = "secret";
    expect(authorizeCron(request())).toBe(false);
  });

  it("accepts only an exact bearer and ignores length mismatches", () => {
    process.env.CRON_SECRET = "secret";
    expect(authorizeCron(request("Bearer secret"))).toBe(true);
    expect(authorizeCron(request("Bearer secretX"))).toBe(false);
    expect(authorizeCron(request("Bearer secreX"))).toBe(false);
    expect(authorizeCron(request("bearer secret"))).toBe(false);
    expect(authorizeCron(request("secret"))).toBe(false);
  });
});
