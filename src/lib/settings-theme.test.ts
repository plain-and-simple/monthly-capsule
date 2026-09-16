import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAPSULE_THEME_HINT, CAPSULE_THEME_SAVE, CAPSULE_THEME_SECTION } from "./copy";

const here = dirname(fileURLToPath(import.meta.url));

function source(rel: string) {
  return readFileSync(resolve(here, rel), "utf8");
}

describe("owner theme picker persistence", () => {
  it("settings is owner-only and members never see the picker", () => {
    const page = source("../app/(app)/g/[uuid]/settings/page.tsx");
    expect(page).toContain("requireOwner");
    expect(page).toContain("SettingsForm");
    const chrome = source("./manage.ts");
    expect(chrome).toContain("canAccessSettings");
    expect(source("../components/group-chrome.tsx")).toContain("canAccessSettings(role)");
  });

  it("settings shows a swatch plus name, not a word-only list", () => {
    const form = source("../components/theme-form.tsx");
    expect(form).toContain("CAPSULE_THEME_SECTION");
    expect(form).toContain("theme-pick__swatch");
    expect(form).toContain("theme-pick__name");
    expect(form).toContain('name="capsule_theme"');
    expect(form).toContain('type="radio"');
    expect(form).toContain("CAPSULE_THEME_CATALOG");
    expect(form).not.toMatch(/<select[^>]*capsule_theme/);
    expect(form).toContain("updateCapsuleTheme");
    expect(CAPSULE_THEME_SECTION).toBe("Capsule theme");
    expect(CAPSULE_THEME_SAVE).toBe("Save theme");
    expect(CAPSULE_THEME_HINT).toMatch(/Past months stay/);
  });

  it("saving a theme is owner-gated and writes groups.capsule_theme", () => {
    const action = source("../actions/settings.ts");
    expect(action).toContain("export async function updateCapsuleTheme");
    expect(action).toContain("requireOwnerUncached(groupId)");
    expect(action).not.toMatch(/await requireOwner\(groupId\)/);
    expect(action).toContain("parseThemeFormValue");
    expect(action).toContain("capsule_theme: theme");
    expect(action).toContain('.select("capsule_theme")');
    expect(action).toContain("CAPSULE_THEME_INVALID");
    const form = source("../components/theme-form.tsx");
    expect(form).toContain("themeFormValue");
    expect(form).toContain("checked={option.id === selected}");
  });

  it("the next compile reads the group theme and archives it", () => {
    const compile = source("./compile.ts");
    expect(compile).toContain("parseCapsuleTheme(group.capsule_theme)");
    expect(compile).toContain("theme:");
    const view = source("../app/(app)/g/[uuid]/capsule/view.tsx");
    expect(view).toContain("archive.theme");
    expect(view).toContain("CapsuleDocument");
    expect(view).not.toContain("group.capsule_theme");
  });
});
