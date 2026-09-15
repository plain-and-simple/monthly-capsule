import { describe, expect, it } from "vitest";
import { PRODUCTION_HOST, PRODUCTION_ORIGIN } from "@/lib/hosting";
import {
  E2E_ALLOW_PRODUCTION_VALUE,
  E2E_LOCAL_ORIGIN,
  assertE2ETargetAllowed,
  canRunAuthenticatedE2E,
  canRunCronDryRun,
  isProductionE2ETarget,
  resolveE2EBaseURL,
  shouldStartLocalWebServer,
} from "@/lib/e2e-target";

describe("e2e target is fail-closed against production", () => {
  it("treats the hosting lock origin as production", () => {
    expect(isProductionE2ETarget(PRODUCTION_ORIGIN)).toBe(true);
    expect(isProductionE2ETarget(`https://${PRODUCTION_HOST}/`)).toBe(true);
    expect(isProductionE2ETarget("https://capsule.plainandsimple.app/manage")).toBe(true);
  });

  it("does not treat localhost, previews, or sibling hosts as production", () => {
    expect(isProductionE2ETarget(E2E_LOCAL_ORIGIN)).toBe(false);
    expect(isProductionE2ETarget("http://localhost:3000")).toBe(false);
    expect(isProductionE2ETarget("https://monthly-capsule-git-main.vercel.app")).toBe(false);
    expect(isProductionE2ETarget("https://plainandsimple.app")).toBe(false);
  });

  it("defaults to local origin when E2E_BASE_URL is unset", () => {
    expect(resolveE2EBaseURL({})).toBe(E2E_LOCAL_ORIGIN);
    expect(resolveE2EBaseURL({ E2E_BASE_URL: "  " })).toBe(E2E_LOCAL_ORIGIN);
    expect(shouldStartLocalWebServer({})).toBe(true);
    expect(shouldStartLocalWebServer({ CI: "true" })).toBe(true);
  });

  it("uses an explicit preview URL and strips a trailing slash", () => {
    const preview = "https://monthly-capsule-git-ready.vercel.app/";
    expect(resolveE2EBaseURL({ E2E_BASE_URL: preview })).toBe(
      "https://monthly-capsule-git-ready.vercel.app",
    );
    expect(shouldStartLocalWebServer({ E2E_BASE_URL: preview })).toBe(false);
  });

  it("refuses production unless E2E_ALLOW_PRODUCTION=1", () => {
    expect(() => resolveE2EBaseURL({ E2E_BASE_URL: PRODUCTION_ORIGIN })).toThrow(
      /Refusing to run e2e against production/,
    );
    expect(() =>
      resolveE2EBaseURL({
        E2E_BASE_URL: PRODUCTION_ORIGIN,
        E2E_ALLOW_PRODUCTION: "true",
      }),
    ).toThrow(/Refusing to run e2e against production/);
    expect(() =>
      assertE2ETargetAllowed(PRODUCTION_ORIGIN, { E2E_ALLOW_PRODUCTION: "yes" }),
    ).toThrow(/E2E_ALLOW_PRODUCTION=1/);
  });

  it("allows production only with the explicit flag", () => {
    expect(
      resolveE2EBaseURL({
        E2E_BASE_URL: PRODUCTION_ORIGIN,
        E2E_ALLOW_PRODUCTION: E2E_ALLOW_PRODUCTION_VALUE,
      }),
    ).toBe(PRODUCTION_ORIGIN);
  });

  it("gates authenticated and cron dry-run paths on secrets", () => {
    expect(canRunAuthenticatedE2E({})).toBe(false);
    expect(canRunAuthenticatedE2E({ E2E_EMAIL: "a@b.c" })).toBe(false);
    expect(
      canRunAuthenticatedE2E({
        E2E_EMAIL: "a@b.c",
        E2E_PASSWORD: "password1",
      }),
    ).toBe(true);
    expect(
      canRunAuthenticatedE2E({
        CI: "true",
        E2E_EMAIL: "a@b.c",
        E2E_PASSWORD: "password1",
      }),
    ).toBe(false);
    expect(
      canRunAuthenticatedE2E({
        CI: "true",
        E2E_BASE_URL: "https://preview.example",
        E2E_EMAIL: "a@b.c",
        E2E_PASSWORD: "password1",
      }),
    ).toBe(true);

    expect(canRunCronDryRun({})).toBe(false);
    expect(canRunCronDryRun({ E2E_CRON_SECRET: "secret" })).toBe(true);
    expect(canRunCronDryRun({ CI: "true", E2E_CRON_SECRET: "secret" })).toBe(false);
    expect(
      canRunCronDryRun({
        CI: "true",
        E2E_BASE_URL: "https://preview.example",
        E2E_CRON_SECRET: "secret",
      }),
    ).toBe(true);
  });
});
