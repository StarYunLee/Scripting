import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("Stage F routes dashboard refresh through the bounded widget source plane", async () => {
  const [loader, refresh, entry, settings] = await Promise.all([
    source("widget/dashboard-loader.ts"),
    source("services/refresh.ts"),
    source("widget.tsx"),
    source("pages/SettingsPage.tsx"),
  ]);
  assert.match(loader, /refreshAccounts\(/);
  assert.match(loader, /\{ force: false, source: "widget" \}/);
  assert.doesNotMatch(loader, /for \(const card of selected\)/);
  assert.doesNotMatch(loader, /pages\//);
  assert.match(refresh, /source: "app" \| "widget" \| "intent"/);
  assert.match(entry, /resolved\.mode === "dashboard"/);
  assert.match(entry, /DashboardWidgetView/);
  assert.match(settings, /Widget\.preview\(/);
  assert.match(settings, /systemExtraLarge/);
});

test("dashboard widget view keeps deterministic rings and single-line Small rows", async () => {
  const view = await source("widget/dashboard/DashboardWidgetView.tsx");
  const model = await source("widget/dashboard/model.ts");

  // Medium rings must be deterministic Circle+trim strokes, never circular ProgressView.
  assert.doesNotMatch(view, /progressViewStyle/i);
  assert.match(view, /<Circle/);
  assert.match(view, /trim=\{\{/);
  assert.match(model, /export function ringStroke/);

  // Small is fixed five single-line rows with logo + quota title + percent, no overflow footer.
  assert.doesNotMatch(view, /widgetOverflowSmall/);
  assert.match(view, /widgetQuotaTitle\(/);
  assert.match(view, /ProviderLogo/);

  // Large row titles carry quota/window only; provider stays in the badge/logo slot.
  assert.match(view, /widgetWindowOnlyTitle\(/);

  // Large overflow is the short "+N" marker.
  assert.match(view, /widgetOverflowLargeShort\(/);
});
