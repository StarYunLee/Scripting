import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Stage F keeps app and widget display planes recoverable and isolated", async () => {
  const [prefs, hub, page] = await Promise.all([
    source("services/dashboard-prefs.ts"),
    source("services/hub.ts"),
    source("pages/DashboardPrefsPage.tsx"),
  ]);

  assert.match(hub, /export function listAllAuthorizedCards\(/);
  assert.match(hub, /applyDashboardPrefs\(listAllAuthorizedCards\(\)\)/);
  assert.match(page, /listAllAuthorizedCards\(\)/);
  const status = await source("pages/StatusPage.tsx");
  assert.match(status, /const authorized = listAllAuthorizedCards\(\)/);
  assert.match(status, /const targets = listAllAuthorizedCards\(\)/);
  assert.doesNotMatch(page, /额度条目/);
  assert.match(page, /title=\{props\.card\.title\}/);
  assert.match(page, /normalizeAppWindowLabel\(window\.label\)/);
  assert.doesNotMatch(
    page,
    /<Section[\s\S]{0,220}?footer=\{/,
    "Dashboard preferences descriptions must stay inside their glass cards",
  );
  assert.match(prefs, /WidgetPrivacyPrefs/);
  assert.match(prefs, /ai_usage_widget_dashboard_prefs_v1/);
  assert.doesNotMatch(prefs + hub, /copy\/labels/);
  assert.match(page, /copy\/labels/);
});

test("Settings keeps dashboard descriptions inside the glass settings groups", async () => {
  const settings = await source("pages/SettingsPage.tsx");
  const dashboardStart = settings.indexOf(
    '<GlassSectionHeader title="用量总览" />',
  );
  const runtimeStart = settings.indexOf(
    '<GlassSectionHeader title="运行与支持" />',
  );
  const dashboardSections = settings.slice(dashboardStart, runtimeStart);
  assert.doesNotMatch(dashboardSections, /footer=\{/);
  assert.match(dashboardSections, /\{APP_DASHBOARD_SETTINGS_FOOTER\}/);
  assert.match(dashboardSections, /\{WIDGET_DASHBOARD_SETTINGS_FOOTER\}/);
});
