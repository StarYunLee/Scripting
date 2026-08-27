import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("Stage G centralizes shared window copy and keeps provider themes visual-only", async () => {
  const [labels, model, dashboard, prefsPage, settings, minimaxTheme] =
    await Promise.all([
      source("copy/labels.ts"),
      source("widget/dashboard/model.ts"),
      source("widget/dashboard/DashboardWidgetView.tsx"),
      source("pages/DashboardPrefsPage.tsx"),
      source("pages/SettingsPage.tsx"),
      source("providers/minimax/theme.ts"),
    ]);

  assert.match(labels, /CURSOR_WINDOW/);
  assert.match(labels, /COPILOT_WINDOW/);
  assert.match(labels, /ZAI_WINDOW/);
  assert.match(model, /copy\/labels/);
  assert.doesNotMatch(model, /value\.includes\("周"\)|return "Weekly"/);
  assert.match(dashboard, /WIDGET_TITLE/);
  assert.match(prefsPage, /normalizeAppWindowLabel/);
  assert.match(settings, /APP_DASHBOARD_SETTINGS_FOOTER/);
  assert.doesNotMatch(
    minimaxTheme,
    /fiveHourTitle|weeklyTitle|shortFiveHour|shortWeekly/,
  );
});
