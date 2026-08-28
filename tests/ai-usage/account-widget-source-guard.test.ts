import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  migrateLegacyCursorHiddenWindows,
} from "../../AI Usage/widget/shared/window-settings-migration";
import {
  getWidgetWindowSettings,
  setWidgetWindowSettings,
} from "../../AI Usage/services/widget-window-settings";
import { providerWidgetWindowRows } from "../../AI Usage/widget/shared/provider-windows";
import { readFile } from "node:fs/promises";

const LEGACY_KEY = "ai_usage_cursor_profile_settings_v1";
const SHARED = { shared: true };

function installStorage(
  seed?: Record<string, unknown>,
  options?: { failGenericWrite?: boolean },
) {
  const shared = new Map<string, unknown>(Object.entries(seed || {}));
  Object.assign(globalThis, {
    Storage: {
      get(key: string, options?: { shared: boolean }) {
        return options?.shared ? shared.get(key) : undefined;
      },
      set(key: string, value: unknown, storageOptions?: { shared: boolean }) {
        if (
          options?.failGenericWrite &&
          storageOptions?.shared &&
          key === "ai_usage_widget_window_settings_v1"
        ) return false;
        (storageOptions?.shared ? shared : new Map()).set(key, value);
        return true;
      },
    },
  });
  return shared;
}

beforeEach(() => installStorage());

test("migrates legacy Cursor hidden window names into generic ids", () => {
  const shared = installStorage({
    [LEGACY_KEY]: { profiles: { p1: { hiddenWindows: ["weekly", "auto"] } } },
  });
  migrateLegacyCursorHiddenWindows("cursor", "p1");
  assert.deepEqual(getWidgetWindowSettings("cursor", "p1"), {
    hiddenWindowIds: ["cursor:requests", "cursor:auto"],
  });
  const legacy = shared.get(LEGACY_KEY) as { profiles: Record<string, unknown> };
  assert.equal(legacy.profiles.p1, undefined);
});

test("migration is skipped when the account already has generic choices", () => {
  installStorage({
    [LEGACY_KEY]: { profiles: { p1: { hiddenWindows: ["auto"] } } },
  });
  setWidgetWindowSettings("cursor", "p1", { hiddenWindowIds: ["cursor:total"] });
  migrateLegacyCursorHiddenWindows("cursor", "p1");
  assert.deepEqual(getWidgetWindowSettings("cursor", "p1"), {
    hiddenWindowIds: ["cursor:total"],
  });
});

test("explicit generic show-all prevents legacy Cursor overwrite", () => {
  const shared = installStorage({
    [LEGACY_KEY]: { profiles: { p1: { hiddenWindows: ["auto"] } } },
  });
  assert.equal(
    setWidgetWindowSettings("cursor", "p1", { hiddenWindowIds: [] }),
    true,
  );
  migrateLegacyCursorHiddenWindows("cursor", "p1");
  assert.deepEqual(getWidgetWindowSettings("cursor", "p1"), {
    hiddenWindowIds: [],
  });
  const legacy = shared.get(LEGACY_KEY) as { profiles: Record<string, unknown> };
  assert.ok(legacy.profiles.p1, "skipped migration must retain the legacy record");
});

test("failed generic migration write keeps the only durable legacy preference", () => {
  const shared = installStorage(
    {
      [LEGACY_KEY]: { profiles: { p1: { hiddenWindows: ["weekly"] } } },
    },
    { failGenericWrite: true },
  );
  migrateLegacyCursorHiddenWindows("cursor", "p1");
  assert.deepEqual(getWidgetWindowSettings("cursor", "p1"), {
    hiddenWindowIds: [],
  });
  const legacy = shared.get(LEGACY_KEY) as { profiles: Record<string, unknown> };
  assert.ok(legacy.profiles.p1, "failed migration must not delete its source");
});

test("migration is idempotent after the legacy entry is cleared", () => {
  installStorage({
    [LEGACY_KEY]: { profiles: { p1: { hiddenWindows: ["api"] } } },
  });
  migrateLegacyCursorHiddenWindows("cursor", "p1");
  migrateLegacyCursorHiddenWindows("cursor", "p1");
  assert.deepEqual(getWidgetWindowSettings("cursor", "p1"), {
    hiddenWindowIds: ["cursor:api"],
  });
});

test("non-cursor providers never trigger the cursor migration", () => {
  installStorage({
    [LEGACY_KEY]: { profiles: { p1: { hiddenWindows: ["auto"] } } },
  });
  migrateLegacyCursorHiddenWindows("kimi", "p1");
  assert.deepEqual(getWidgetWindowSettings("kimi", "p1"), {
    hiddenWindowIds: [],
  });
});

test("parser-prefixed cursor window ids do not double the provider prefix", () => {
  const rows = providerWidgetWindowRows("cursor", {
    windows: [
      {
        id: "cursor:auto",
        label: "Auto",
        usedPercent: 10,
        remainingPercent: 90,
        resetAt: null,
      },
    ],
    planLabel: null,
    planType: null,
    fetchedAt: "2026-08-27T00:00:00Z",
  });
  assert.deepEqual(rows.map((row) => row.id), ["cursor:auto"]);
});

const ROOT = new URL("../../AI Usage/", import.meta.url);

test("single-account Extra Large keeps the legacy provider renderers", async () => {
  const source = await readFile(new URL("widget.tsx", ROOT), "utf8");
  assert.match(source, /const legacyExtraLarge = family\.toLowerCase\(\)\.includes\("extralarge"\)/);
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
    assert.match(
      source,
      new RegExp(`legacyExtraLarge &&\\s+loaded\\.provider === "${provider}"`),
    );
  }
});

test("widget-reachable Cursor settings avoid device-unsupported type predicates", async () => {
  const source = await readFile(
    new URL("providers/cursor/widget-settings.ts", ROOT),
    "utf8",
  );
  assert.doesNotMatch(source, /\)\s*:\s*[^\n{]+\sis\s/);
});

test("single view shows both labeled values in both families; small dual/multi stay bare", async () => {
  const source = await readFile(
    new URL("widget/shared/AccountUsageWidgetView.tsx", ROOT),
    "utf8",
  );
  const single = source.slice(
    source.indexOf("function SingleWindowView"),
    source.indexOf("function DualWindow"),
  );
  // 两个带标签的组必须按固定顺序出现：已用 X% 在前，剩余 Y% 在后。
  const usedAt = single.indexOf("`已用 ${formatPercent(used)}`");
  const remainingAt = single.indexOf("`剩余 ${formatPercent(remaining)}`");
  assert.ok(usedAt >= 0, "缺少 已用 X% 标签组");
  assert.ok(remainingAt >= 0, "缺少 剩余 Y% 标签组");
  assert.ok(usedAt < remainingAt, "已用 必须排在 剩余 之前");
  // Small 的 134pt 内容宽度不足以容纳两个固定大字号值，两个 Text 都必须可缩放。
  assert.equal(
    (single.match(/minScaleFactor=\{small \? 0\.65 : 0\.8\}/g) || []).length,
    2,
    "Small single 两个带标签值必须一起缩放，不能省略任一值",
  );
  // 不得再出现裸大数字 + 游离「剩余」标签的旧排版。
  assert.doesNotMatch(single, /\n\s*剩余\s*\n/);
  assert.doesNotMatch(
    single,
    /\{formatPercent\(remaining\)\}[\s\S]*?>[\s\S]*?剩余\s*<\/Text>/,
  );
  // 旧的「仅 Medium 追加剩余」条件分支必须移除。
  assert.doesNotMatch(single, /!\s*small\s*\?\s*\(/);
  // ValueText 的剩余后缀只属于 Medium，Small 双/多行保持裸百分比。
  const valueText = source.slice(
    source.indexOf("function ValueText"),
    source.indexOf("function ResetCreditsChip"),
  );
  assert.match(valueText, /!\s*small\s*\?\s*\(/);
});

test("dual view merges reset credits into the second reset row", async () => {
  const source = await readFile(
    new URL("widget/shared/AccountUsageWidgetView.tsx", ROOT),
    "utf8",
  );
  const dual = source.slice(
    source.indexOf("function DualWindowView"),
    source.indexOf("function MultiWindowView"),
  );
  assert.match(dual, /resetSupplement=\{resetCredits\}/);
  assert.match(dual, /\? `权益 \$\{model\.resetLine\.available \?\? 0\} 次`/);
  assert.doesNotMatch(
    dual,
    /formatResetDate\(\s*model\.resetLine\.nearestExpiration/,
    "Dual 权益补充不得重复第二额度的重置日期",
  );
  assert.doesNotMatch(
    dual,
    /alignment:\s*"bottomLeading"[\s\S]*?<ResetCreditsChip/,
    "a separate bottom chip overlaps the second quota reset line",
  );
});

test("demo fixtures feed the shared settings picker while real accounts stay cache-backed", async () => {
  const source = await readFile(
    new URL("widget/shared/window-candidates.ts", ROOT),
    "utf8",
  );
  assert.match(source, /isDemoAccountId\(profileId\)/);
  assert.match(source, /getDemoWidgetResult\(provider, profileId\)/);
  assert.match(source, /if \(demo && demo\.ok\)/);
  assert.match(source, /demo\.snapshot as ProviderSnapshotInput/);
  assert.match(source, /return widgetWindowCandidates\(provider, read\(profileId\)\)/);
});

test("prefixed cursor ids without name still resolve single-line titles", async () => {
  const { providerWidgetWindowRows } = await import(
    "../../AI Usage/widget/shared/provider-windows"
  );
  const snapshot = {
    windows: [
      {
        id: "cursor:auto",
        label: "Auto",
        usedPercent: 10,
        remainingPercent: 90,
        resetAt: null,
      },
      {
        id: "cursor:requests",
        label: "请求额度",
        usedPercent: 20,
        remainingPercent: 80,
        resetAt: null,
      },
    ],
    planLabel: null,
    planType: null,
    fetchedAt: "2026-08-27T00:00:00Z",
  };
  const rows = providerWidgetWindowRows("cursor", snapshot);
  assert.deepEqual(
    rows.map((row) => [row.id, row.label]),
    [
      ["cursor:auto", "Auto"],
      ["cursor:requests", "7D"],
    ],
  );
});
