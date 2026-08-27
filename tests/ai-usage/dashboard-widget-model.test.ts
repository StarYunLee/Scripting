import assert from "node:assert/strict";
import { test } from "node:test";
import type { UsageCard } from "../../AI Usage/models";
import {
  flattenCards,
  groupRowsByAccount,
  largeVisibleLimit,
  planMediumRings,
  privacySubtitle,
  shortAccountTitle,
  shortWindowLabel,
  smallVisibleLimit,
  widgetDisplaySize,
  widgetLayoutSize,
} from "../../AI Usage/widget/dashboard/model";
import type { WidgetPrivacyPrefs } from "../../AI Usage/services/dashboard-prefs";

const privateDefaults: WidgetPrivacyPrefs = {
  showAccountEmail: false,
  showAccountId: false,
  showPlanBadge: true,
};

function card(
  key: string,
  labels: Array<{ id: string; label: string }>,
): UsageCard {
  const [provider, accountId] = key.split(":") as [UsageCard["provider"], string];
  return {
    key,
    provider,
    accountId,
    title: `${accountId}@example.com`,
    planLabel: "Pro",
    authorized: true,
    windows: labels.map(({ id, label }, index) => ({
      id,
      label,
      usedPercent: 20 + index,
      remainingPercent: 80 - index,
      resetAt: null,
    })),
    resetCredits: null,
    fetchedAt: null,
    source: "cache",
    refreshing: false,
  };
}

test("flattens duplicate labels into unique ordered rows and stable account groups", () => {
  const first = card("codex:one", [
    { id: "five_hour", label: "5 小时" },
    { id: "five_hour_spark", label: "5 小时" },
  ]);
  const second = card("kimi:two", [{ id: "weekly", label: "周限" }]);
  const rows = flattenCards([first, second]);

  assert.deepEqual(
    rows.map((row) => row.key),
    ["codex:one:five_hour", "codex:one:five_hour_spark", "kimi:two:weekly"],
  );
  const groups = groupRowsByAccount(rows);
  assert.deepEqual(groups.map((group) => group.accountKey), ["codex:one", "kimi:two"]);
  assert.equal(groups[0].rows.length, 2);
});

test("maps widget families and fallback dimensions for all four layouts", () => {
  assert.equal(widgetLayoutSize("systemSmall"), "small");
  assert.equal(widgetLayoutSize("systemMedium"), "medium");
  assert.equal(widgetLayoutSize("systemLarge"), "large");
  assert.equal(widgetLayoutSize("systemExtraLarge"), "exlarge");
  assert.deepEqual(widgetDisplaySize("systemSmall"), { width: 158, height: 158 });
  assert.deepEqual(widgetDisplaySize("systemMedium"), { width: 338, height: 158 });
  assert.deepEqual(widgetDisplaySize("systemLarge"), { width: 364, height: 382 });
  assert.deepEqual(widgetDisplaySize("systemExtraLarge"), { width: 510, height: 510 });
});

test("plans bounded readable content for Small Medium and Large", () => {
  const sparse = { ...privateDefaults, showPlanBadge: false };
  const dense = { ...privateDefaults, showAccountEmail: true, showAccountId: true };
  assert.equal(smallVisibleLimit(sparse), 6);
  assert.equal(smallVisibleLimit(dense), 5);

  assert.deepEqual(planMediumRings(3, 338, 158, privateDefaults), {
    rowCount: 1,
    columns: 3,
    ringSize: 52,
    maxVisible: 3,
  });
  const crowded = planMediumRings(12, 338, 158, dense);
  assert.equal(crowded.rowCount, 2);
  assert.equal(crowded.columns, 5);
  assert.equal(crowded.maxVisible, 10);
  assert.ok(crowded.ringSize >= 34 && crowded.ringSize <= 42);

  assert.equal(largeVisibleLimit(privateDefaults, 382), 8);
  assert.equal(largeVisibleLimit(dense, 382), 8);
});

test("shortens account and representative provider window labels without losing fallbacks", () => {
  assert.equal(shortAccountTitle("verylongaccountname@example.com"), "verylo…@example.com");
  assert.equal(shortWindowLabel("每周高级请求"), "Weekly");
  assert.equal(shortWindowLabel("5 小时滚动窗口"), "Session");
  assert.equal(shortWindowLabel("API 调用额度"), "API");
  assert.equal(shortWindowLabel("Allegretto credits"), "Allegrett…");
});

test("reveals only explicitly enabled privacy fields", () => {
  const row = { accountTitle: "longaccountname@example.com", accountId: "acct_123456789012345" };
  assert.equal(privacySubtitle(row, privateDefaults), null);
  assert.equal(
    privacySubtitle(row, { ...privateDefaults, showAccountEmail: true }),
    "longac…@example.com",
  );
  assert.equal(
    privacySubtitle(row, { ...privateDefaults, showAccountId: true }),
    "acct_12345…",
  );
});
