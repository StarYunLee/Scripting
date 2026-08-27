import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  getDashboardPrefs,
  getWidgetPrivacyPrefs,
  resetDashboardPrefs,
  setAccountVisibleOnDashboard,
  setWidgetPrivacyPrefs,
} from "../../AI Usage/services/dashboard-prefs";

const APP_KEY = "ai_usage_dashboard_prefs_v1";
const WIDGET_KEY = "ai_usage_widget_dashboard_prefs_v1";

function installStorage(values: Record<string, unknown> = {}) {
  const storage = new Map(Object.entries(values));
  let writes = 0;
  Object.assign(globalThis, {
    Storage: {
      get(key: string) {
        return storage.get(key);
      },
      set(key: string, value: unknown) {
        writes += 1;
        storage.set(key, value);
      },
    },
  });
  return { storage, writes: () => writes };
}

beforeEach(() => {
  installStorage();
});

test("keeps widget account selection independent from app display preferences", () => {
  setAccountVisibleOnDashboard("codex:a", false, "app");
  setAccountVisibleOnDashboard("grok:b", false, "widget");

  assert.deepEqual(getDashboardPrefs("app").hiddenAccountKeys, ["codex:a"]);
  assert.deepEqual(getDashboardPrefs("widget").hiddenAccountKeys, ["grok:b"]);
  resetDashboardPrefs("widget");
  assert.deepEqual(getDashboardPrefs("app").hiddenAccountKeys, ["codex:a"]);
  assert.deepEqual(getDashboardPrefs("widget").hiddenAccountKeys, []);
});

test("defaults widget privacy to hiding account details while keeping plan badges", () => {
  assert.deepEqual(getWidgetPrivacyPrefs(), {
    showAccountEmail: false,
    showAccountId: false,
    showPlanBadge: true,
  });

  setWidgetPrivacyPrefs({ showAccountEmail: true, showPlanBadge: false });
  assert.deepEqual(getWidgetPrivacyPrefs(), {
    showAccountEmail: true,
    showAccountId: false,
    showPlanBadge: false,
  });
});

test("migrates legacy widget version 1 preferences without touching app storage", () => {
  const runtime = installStorage({
    [APP_KEY]: {
      version: 1,
      hiddenAccountKeys: ["codex:app"],
      hiddenWindowIdsByAccount: {},
    },
    [WIDGET_KEY]: {
      version: 1,
      hiddenAccountKeys: ["kimi:widget"],
      hiddenWindowIdsByAccount: { "kimi:widget": ["weekly"] },
    },
  });

  assert.deepEqual(getDashboardPrefs("widget"), {
    version: 2,
    hiddenAccountKeys: ["kimi:widget"],
    hiddenWindowIdsByAccount: { "kimi:widget": ["weekly"] },
    privacy: {
      showAccountEmail: false,
      showAccountId: false,
      showPlanBadge: true,
    },
  });
  assert.equal(runtime.writes(), 0);
  assert.deepEqual(runtime.storage.get(APP_KEY), {
    version: 1,
    hiddenAccountKeys: ["codex:app"],
    hiddenWindowIdsByAccount: {},
  });
});

test("fails closed on a future widget preference version without overwriting it", () => {
  const future = {
    version: 3,
    hiddenAccountKeys: ["zai:a"],
    hiddenWindowIdsByAccount: {},
    privacy: { showAccountEmail: true },
    futureField: "must-survive",
  };
  const runtime = installStorage({ [WIDGET_KEY]: future });

  assert.throws(
    () => getDashboardPrefs("widget"),
    /总览偏好数据版本较新/,
  );
  assert.throws(
    () => setWidgetPrivacyPrefs({ showAccountId: true }),
    /总览偏好数据版本较新/,
  );
  assert.equal(runtime.writes(), 0);
  assert.deepEqual(runtime.storage.get(WIDGET_KEY), future);
});
