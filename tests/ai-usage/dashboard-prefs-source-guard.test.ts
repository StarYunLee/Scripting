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
  assert.match(prefs, /WidgetPrivacyPrefs/);
  assert.match(prefs, /ai_usage_widget_dashboard_prefs_v1/);
  assert.doesNotMatch(prefs + hub, /copy\/labels/);
  assert.match(page, /copy\/labels/);
});
