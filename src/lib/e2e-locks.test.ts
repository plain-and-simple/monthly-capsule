import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CREATE_GROUP_CODE } from "@/lib/studio-code";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe("e2e suite locks", () => {
  it("does not hardcode the studio code or production credentials", () => {
    const files = [
      ...listFiles(resolve(repoRoot, "e2e")),
      resolve(repoRoot, "playwright.config.ts"),
      resolve(repoRoot, ".github/workflows/ci.yml"),
    ];
    const sources = files
      .filter((path) => /\.(ts|yml)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(sources).not.toMatch(
      new RegExp(`fill\\([^\\n]*${DEFAULT_CREATE_GROUP_CODE}`, "i"),
    );
    expect(sources).not.toMatch(/E2E_PASSWORD\s*[:=]\s*['"][^'"]+['"]/);
    expect(sources).not.toMatch(/E2E_EMAIL\s*[:=]\s*['"][^'"\s]+@/);
    expect(sources).toContain("E2E_ALLOW_PRODUCTION");
    expect(sources).toContain("BAD_STUDIO_CODE");
  });

  it("documents empty secret placeholders in README and .env.example", () => {
    const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
    const envExample = readFileSync(resolve(repoRoot, ".env.example"), "utf8");
    for (const name of ["E2E_BASE_URL", "E2E_EMAIL", "E2E_PASSWORD", "E2E_GROUP_PIN"]) {
      expect(readme).toContain(name);
      expect(envExample).toContain(`${name}=`);
    }
    expect(readme).toContain("E2E_ALLOW_PRODUCTION");
    expect(readme).toContain("npm run test:e2e");
    expect(envExample).not.toMatch(/^E2E_PASSWORD=.+/m);
  });
});
