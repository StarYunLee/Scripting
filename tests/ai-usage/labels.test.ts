import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PERIOD,
  antigravityWindowLabel,
  claudeScopedAppLabel,
  normalizeAppWindowLabel,
  parseWidgetWindowParts,
  widgetProviderShortName,
  widgetAccountOverflow,
  widgetOverflowLarge,
  widgetOverflowMedium,
  widgetOverflowSmall,
  widgetQuotaTitle,
  widgetWindowLabel,
} from "../../AI Usage/copy/labels";

test("uses canonical App Chinese and Widget abbreviations for shared periods", () => {
  assert.deepEqual(PERIOD.FIVE_HOUR, { app: "5 小时", widget: "5h" });
  assert.deepEqual(PERIOD.WEEKLY, { app: "每周", widget: "Weekly" });
  assert.deepEqual(PERIOD.MONTHLY, { app: "每月", widget: "Monthly" });
  assert.equal(normalizeAppWindowLabel("周限"), "每周");
  assert.equal(normalizeAppWindowLabel("Fable 周限"), "Fable 每周");
  assert.equal(claudeScopedAppLabel("Sonnet"), "Sonnet 每周");
});

test("records Cursor official product labels as explicit exceptions", () => {
  assert.equal(normalizeAppWindowLabel("Auto"), "Auto");
  assert.equal(normalizeAppWindowLabel("所有"), "Total");
  assert.equal(normalizeAppWindowLabel("第三方模型"), "API");
  assert.equal(normalizeAppWindowLabel("总计"), "总计");
  assert.equal(normalizeAppWindowLabel("第三方 API"), "第三方 API");
  assert.equal(normalizeAppWindowLabel("Grok Bot"), "Grok Bot");
  assert.equal(widgetWindowLabel("Auto"), "Auto");
  assert.equal(widgetWindowLabel("所有"), "Total");
  assert.equal(widgetWindowLabel("第三方模型"), "API");
  assert.equal(widgetWindowLabel("Grok Bot"), "Grok Bot");
});

test("keeps Antigravity product groups while abbreviating their periods", () => {
  assert.deepEqual(parseWidgetWindowParts("Gemini Model 5 小时"), {
    group: "Gemini",
    periodWidget: "5h",
  });
  assert.deepEqual(parseWidgetWindowParts("Claude and GPT 每周"), {
    group: "GPT",
    periodWidget: "Weekly",
  });
  assert.equal(
    antigravityWindowLabel("fallback", "gemini-5h", 5 * 3600),
    "Gemini Model 5 小时",
  );
  assert.equal(
    antigravityWindowLabel("fallback", "3p-weekly", 7 * 86400),
    "Claude and GPT 每周",
  );
  assert.equal(
    antigravityWindowLabel("Custom", "other", null),
    "Custom other",
  );
});

test("uses one Widget title rule across providers and long-label fallback", () => {
  assert.equal(widgetProviderShortName("codex"), "ChatGPT");
  assert.equal(widgetProviderShortName("antigravity"), "Agy");
  assert.equal(widgetQuotaTitle("codex", "5 小时"), "ChatGPT · 5h");
  assert.equal(widgetQuotaTitle("antigravity", "Gemini Model 每周"), "Agy · Gemini · Weekly");
  assert.equal(widgetWindowLabel("Allegretto credits"), "Allegrett…");
  assert.equal(widgetOverflowSmall(3), "还有 3 条");
  assert.equal(widgetOverflowMedium(4), "还有 4 条 · 用大尺寸查看");
  assert.equal(widgetOverflowLarge(5), "还有 5 条未显示");
  assert.equal(widgetAccountOverflow(2), "该账号还有 2 条未显示");
});
