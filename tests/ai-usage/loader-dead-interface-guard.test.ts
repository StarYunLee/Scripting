import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("widget loader must not import legacy per-provider settings modules", async () => {
  const loader = await source("widget/loader.ts");
  // 旧 selector（focusWindow/widgetStyle/dualQuotaPreset/widgetLayout/hiddenWindows）
  // 已统一为 services/widget-window-settings，loader 静态依赖里不允许再出现它们。
  assert.doesNotMatch(loader, /from "[^"]*\/credentials"/);
  assert.doesNotMatch(loader, /from "[^"]*\/widget-settings"/);
  assert.doesNotMatch(loader, /getEffectiveSettings/);
  assert.doesNotMatch(loader, /WidgetSettings/);
  assert.doesNotMatch(loader, /\bsettings:/);
});

test("loaded widget payload shrinks to provider and result only", async () => {
  const loader = await source("widget/loader.ts");
  const union = loader.slice(
    loader.indexOf("export type LoadedWidgetUsage"),
    loader.indexOf("type LoadedCodexWidget"),
  );
  for (const provider of [
    "codex",
    "grok",
    "claude",
    "antigravity",
    "cursor",
    "kimi",
    "copilot",
    "zai",
    "minimax",
  ]) {
    const member = union.slice(
      union.indexOf(`provider: "${provider}"`),
      union.indexOf(`provider: "${provider}"`) + 120,
    );
    assert.match(member, /result: \w+UsageResult/);
    assert.doesNotMatch(member, /settings/);
  }
});

test("widget entry reads hidden window ids from the generic store only", async () => {
  const entry = await source("widget.tsx");
  assert.match(entry, /getWidgetWindowSettings/);
  assert.doesNotMatch(entry, /loaded\.settings/);
  assert.doesNotMatch(entry, /from "[^"]*\/credentials"/);
  assert.doesNotMatch(entry, /from "[^"]*\/widget-settings"/);
});
