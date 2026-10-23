import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "puppeteer-core";

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar";

let browserPromise: Promise<Browser> | null = null;

function walkChrome(dir: string, depth: number): string | null {
  if (depth > 6) return null;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.includes("Helper") || entry === "Frameworks" || entry === "Resources") continue;
    const full = join(dir, entry);
    let isFile = false;
    try {
      isFile = statSync(full).isFile();
    } catch {
      continue;
    }
    if (
      isFile &&
      (entry === "Google Chrome for Testing" ||
        entry === "chrome" ||
        entry === "chromium" ||
        entry === "headless_shell" ||
        entry === "Google Chrome")
    ) {
      return full;
    }
    if (!isFile && (entry.endsWith(".app") || !entry.includes("."))) {
      const found = walkChrome(full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function findLocalChrome(): string | null {
  const explicit = process.env.CAPSULE_CHROME_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library/Caches/ms-playwright"),
    join(homedir(), ".cache/ms-playwright"),
  ].filter((root): root is string => Boolean(root));
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const found = walkChrome(root, 0);
    if (found) return found;
  }
  return null;
}

async function launchCapsuleBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: { width: 816, height: 1056, deviceScaleFactor: 1 },
    });
  }
  const executablePath = findLocalChrome();
  if (!executablePath) {
    throw new Error(
      "Headless Chrome is not available for the capsule PDF. Install Playwright's Chromium or set CAPSULE_CHROME_PATH.",
    );
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage", "--font-render-hinting=none", "--allow-file-access-from-files"],
    defaultViewport: { width: 816, height: 1056, deviceScaleFactor: 1 },
  });
}

export function getCapsuleBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchCapsuleBrowser().catch((error: unknown) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export async function shutdownCapsuleBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // The render already failed or the browser exited.
  }
}

/** Print one HTML document to a PDF. Reuses the browser after the first launch. */
export async function printHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getCapsuleBrowser();
  const page = await browser.newPage();
  const dir = mkdtempSync(join(tmpdir(), "capsule-b2-"));
  try {
    const file = join(dir, "capsule.html");
    writeFileSync(file, html);
    await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 45_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      width: "8.5in",
      height: "11in",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    await page.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
}
