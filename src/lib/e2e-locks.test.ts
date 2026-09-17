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
    return entry.isDirectory() ? (entry.name === ".auth" ? [] : listFiles(path)) : [path];
  });
}

function readWorkflow(name: string): string {
  return readFileSync(resolve(repoRoot, ".github/workflows", name), "utf8");
}

function workflowTriggers(yaml: string): string {
  const match = yaml.match(/^on:\n([\s\S]*?)\n(?:concurrency|permissions|env|jobs):/m);
  return match?.[1] ?? "";
}

describe("e2e suite locks", () => {
  it("does not hardcode the studio code or production credentials", () => {
    const files = [
      ...listFiles(resolve(repoRoot, "e2e")),
      resolve(repoRoot, "playwright.config.ts"),
      ...listFiles(resolve(repoRoot, ".github/workflows")),
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

  it("keeps PR and main CI smoke off production e2e secrets", () => {
    const ci = readWorkflow("ci.yml");
    const triggers = workflowTriggers(ci);
    expect(triggers).toMatch(/pull_request:/);
    expect(triggers).toMatch(/branches:\s*\[main\]/);
    expect(triggers).not.toMatch(/deployment_status/);
    expect(ci).not.toMatch(/\$\{\{\s*secrets\.E2E_/);
  });

  it("runs authenticated production e2e only after Vercel Production is Ready", () => {
    const prod = readWorkflow("e2e-production.yml");
    const triggers = workflowTriggers(prod);
    expect(triggers).toMatch(/deployment_status:/);
    expect(triggers).not.toMatch(/pull_request/);
    expect(prod).toContain("github.event.deployment_status.state == 'success'");
    expect(prod).toContain("environment == 'Production'");
    expect(prod).toContain("secrets.E2E_BASE_URL");
    expect(prod).toContain("secrets.E2E_EMAIL");
    expect(prod).toContain("secrets.E2E_PASSWORD");
    expect(prod).toContain("secrets.E2E_ALLOW_PRODUCTION");
    expect(prod).not.toMatch(/^\s+environment:\s*Production\s*$/m);
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

  it("reuses one signed-in storage state instead of posting login on every auth test", () => {
    const auth = readFileSync(resolve(repoRoot, "e2e/ready-auth.spec.ts"), "utf8");
    const setup = readFileSync(resolve(repoRoot, "e2e/auth.setup.ts"), "utf8");
    const config = readFileSync(resolve(repoRoot, "playwright.config.ts"), "utf8");
    expect(auth).toContain("storageState");
    expect(auth).not.toContain("signIn(");
    expect(auth).toContain("openCapsuleCover");
    expect(auth).toContain("You have been invited");
    expect(auth).toContain("DOWNLOAD_PDF_LABEL");
    expect(setup).toContain("signIn(");
    expect(setup).toContain("storageState");
    expect(config).toContain("auth\\.setup\\.ts");
    expect(config).toContain('name: "setup"');
    const ready = readFileSync(resolve(repoRoot, "e2e/helpers/ready.ts"), "utf8");
    expect(ready).toContain("CYCLE_ALREADY_OPEN");
    expect(ready).toContain("CYCLE_CLOSE_COMPILE");
    expect(ready).toContain("opened.or(already).or(close)");
  });
});
