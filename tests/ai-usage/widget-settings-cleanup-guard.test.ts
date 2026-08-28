import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}`);
  assert.ok(start >= 0, `缺少 export function ${name}`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `函数 ${name} 结构不完整`);
  return source.slice(start, end);
}

test("both hub cleanup paths clear generic widget window settings", async () => {
  const hub = await source("services/hub.ts");
  for (const name of ["deleteAuthorizedAccount", "cancelProviderAuth"]) {
    const fn = extractFunction(hub, name);
    assert.match(fn, /clearWidgetWindowSettings\(provider, profileId\)/);
    // 清理必须发生在移除 profile 之前的同一事务里。
    assert.ok(
      fn.indexOf("clearWidgetWindowSettings") < fn.indexOf("api.remove"),
      `${name} 中通用设置清理必须在 api.remove 之前`,
    );
  }
});

test("cancel path only clears when the profile is still unauthorized", async () => {
  const hub = await source("services/hub.ts");
  const fn = extractFunction(hub, "cancelProviderAuth");
  assert.match(fn, /if \(!api\.token\(profileId\)\)/);
  // 已授权账号取消授权面板时不得误清任何设置。
  const guarded = fn.slice(fn.indexOf("if (!api.token"));
  assert.match(guarded, /clearWidgetWindowSettings/);
  assert.ok(fn.indexOf("api.auth.clearPending()") < fn.indexOf("if (!api.token"));
});

test("settings module keeps the shared-storage account registry contract", async () => {
  const settings = await source("services/widget-window-settings.ts");
  assert.match(settings, /STORAGE_KEY = "ai_usage_widget_window_settings_v1"/);
  assert.match(settings, /SHARED_STORAGE = \{ shared: true \}/);
  assert.match(settings, /export function clearWidgetWindowSettings/);
});
