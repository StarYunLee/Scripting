import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("Stage G centralizes shared window copy and keeps provider themes visual-only", async () => {
  const [
    labels,
    model,
    dashboard,
    prefsPage,
    settings,
    minimaxTheme,
    kimiWidget,
    copilotWidget,
    zaiWidget,
    antigravityParser,
    codexOverviewWidget,
    codexDetailWidget,
    grokWidget,
    claudeWidget,
    antigravityWidget,
    cursorWidget,
  ] = await Promise.all([
    source("copy/labels.ts"),
    source("widget/dashboard/model.ts"),
    source("widget/dashboard/DashboardWidgetView.tsx"),
    source("pages/DashboardPrefsPage.tsx"),
    source("pages/SettingsPage.tsx"),
    source("providers/minimax/theme.ts"),
    source("widget/kimi/UsageWidgetView.tsx"),
    source("widget/copilot/UsageWidgetView.tsx"),
    source("widget/zai/UsageWidgetView.tsx"),
    source("providers/antigravity/parsing.ts"),
    source("widget/codex/OverviewWidgetView.tsx"),
    source("widget/codex/DetailWidgetView.tsx"),
    source("widget/grok/WeeklyUsageWidgetView.tsx"),
    source("widget/claude/UsageWidgetView.tsx"),
    source("widget/antigravity/UsageWidgetView.tsx"),
    source("widget/cursor/UsageWidgetView.tsx"),
  ]);

  assert.match(labels, /CURSOR_WINDOW/);
  assert.match(labels, /COPILOT_WINDOW/);
  assert.match(labels, /ZAI_WINDOW/);
  assert.match(model, /copy\/labels/);
  assert.doesNotMatch(model, /value\.includes\("周"\)|return "Weekly"/);
  assert.match(dashboard, /WIDGET_TITLE/);
  // Small shows fixed five single-line rows: no overflow footer label.
  assert.doesNotMatch(dashboard, /widgetOverflowSmall/);
  assert.match(dashboard, /widgetOverflowMedium/);
  assert.match(dashboard, /widgetOverflowLarge/);
  assert.match(dashboard, /widgetOverflowLargeShort/);
  assert.doesNotMatch(dashboard, /另有 \{(?:hidden|extra)\}|\+\{hidden\} 条/);
  for (const widget of [kimiWidget, copilotWidget, zaiWidget]) {
    assert.match(widget, /copy\/labels/);
    assert.doesNotMatch(widget, /title="(?:5H|周限)"/);
  }
  for (const widget of [
    codexOverviewWidget,
    codexDetailWidget,
    grokWidget,
    claudeWidget,
    antigravityWidget,
  ]) {
    assert.match(widget, /providers\/[^"\n]+\/window-titles/);
  }
  assert.match(cursorWidget, /copy\/labels/);
  assert.doesNotMatch(codexOverviewWidget + codexDetailWidget, /"(?:5H|周限|月限)"/);
  assert.doesNotMatch(grokWidget, /"周限"/);
  assert.doesNotMatch(claudeWidget, /"(?:周限|周限额度|Fable 周限)"/);
  assert.doesNotMatch(
    antigravityWidget,
    /"(?:Claude\/GPT5H|Claude\/GPT 周|Gemini 5H|Gemini 周)"/,
  );
  assert.doesNotMatch(cursorWidget, /"(?:AUTO|所有|Auto 额度|所有额度)"/);
  assert.match(antigravityParser, /return antigravityWindowLabel\(groupName, bucketId, seconds\)/);
  assert.match(prefsPage, /normalizeAppWindowLabel/);
  assert.match(settings, /APP_DASHBOARD_SETTINGS_FOOTER/);
  assert.doesNotMatch(
    minimaxTheme,
    /fiveHourTitle|weeklyTitle|shortFiveHour|shortWeekly/,
  );
});
