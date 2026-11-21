import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CapsuleLayoutError } from "./capsule-b2";
import { canFinishCompile, codedError, opsFailureCode } from "./compile-policy";

const here = dirname(fileURLToPath(import.meta.url));

describe("compile keepsake gate", () => {
  it("finishes only when the archive and a pdf path both exist", () => {
    expect(canFinishCompile({ archiveWritten: false, pdfStoragePath: "g/pdfs/2026-10/v1.pdf" })).toBe(false);
    expect(canFinishCompile({ archiveWritten: true, pdfStoragePath: null })).toBe(false);
    expect(canFinishCompile({ archiveWritten: true, pdfStoragePath: undefined })).toBe(false);
    expect(canFinishCompile({ archiveWritten: true, pdfStoragePath: "" })).toBe(false);
    expect(canFinishCompile({ archiveWritten: true, pdfStoragePath: "g/pdfs/2026-10/v1.pdf" })).toBe(true);
  });

  it("logs a short code and never a letter or an address", () => {
    expect(opsFailureCode(new CapsuleLayoutError())).toBe("layout_incomplete");
    expect(opsFailureCode(codedError("pdf_photos_missing"))).toBe("pdf_photos_missing");
    expect(opsFailureCode(codedError("pdf_upload_failed"))).toBe("pdf_upload_failed");
    expect(opsFailureCode(new Error("synthetic letter body user@example.test"))).toBe("compile_failed");
    expect(opsFailureCode({ code: "not a code user@example.test" })).toBe("compile_failed");
    expect(opsFailureCode({ code: "PGRST303" })).toBe("PGRST303");
    expect(opsFailureCode(null)).toBe("compile_failed");
  });

  it("force close reports the code and leaves the month unstamped", () => {
    const cycle = readFileSync(resolve(here, "../actions/cycle.ts"), "utf8");
    const slice = cycle.slice(
      cycle.indexOf("export async function forceCloseCompile"),
      cycle.indexOf("export async function emailGroupNow"),
    );
    expect(slice).toContain("opsFailureCode");
    expect(slice).toContain("compile failed");
    expect(slice).toContain("reportOpsAlert");
    expect(slice).toContain('route: "forceCloseCompile"');
    expect(slice).toContain("groupId");
    expect(slice).toContain("yearMonth");
    expect(slice).not.toContain("ALERT_EMAIL");
    expect(slice).not.toContain("letter.body");
    expect(slice).not.toMatch(/reportOpsAlert\(\{[^}]*\bbody:/);
    expect(slice.indexOf("compileGroupMonth")).toBeLessThan(slice.indexOf("catch"));
  });
});
