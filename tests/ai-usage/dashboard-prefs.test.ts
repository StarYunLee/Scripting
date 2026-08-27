import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  applyDashboardPrefs,
  getDashboardPrefs,
  resetDashboardPrefs,
  setAccountVisibleOnDashboard,
  setDashboardPrefs,
  setWindowVisibleOnDashboard,
  type DashboardPrefs,
} from "../../AI Usage/services/dashboard-prefs";
import type { UsageCard } from "../../AI Usage/models";

const STORAGE_KEY = "ai_usage_dashboard_prefs_v1";

function installStorage(input?: { value?: unknown; failGet?: boolean; failSet?: boolean }) {
  const values = new Map<string, unknown>();
  if (input && "value" in input) values.set(STORAGE_KEY, input.value);
  let writes = 0;
  Object.assign(globalThis, {
    Storage: {
      get(key: string) {
        if (input?.failGet) throw new Error("get failed");
        return values.get(key);
      },
      set(key: string, value: unknown) {
        writes += 1;
        if (input?.failSet) throw new Error("set failed");
        values.set(key, value);
      },
    },
  });
  return { values, writes: () => writes };
}

function card(key: string, windowIds: string[]): UsageCard {
  const [provider, accountId] = key.split(":") as [UsageCard["provider"], string];
  return {
    key,
    provider,
    accountId,
    title: key,
    planLabel: null,
    authorized: true,
    windows: windowIds.map((id) => ({
      id,
      label: id,
      usedPercent: 25,
      remainingPercent: 75,
      resetAt: null,
    })),
    resetCredits: null,
    fetchedAt: null,
    source: "cache",
    refreshing: false,
  };
}

beforeEach(() => {
  installStorage();
});

test("defaults to an app-only version 1 preference document", () => {
  assert.deepEqual(getDashboardPrefs(), {
    version: 1,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
  });
});

test("sanitizes hostile storage payloads into unique non-empty ids", () => {
  installStorage({
    value: {
      version: 1,
      hiddenAccountKeys: [" codex:a ", "", 7, "codex:a", "grok:b"],
      hiddenWindowIdsByAccount: {
        " codex:a ": [" five_hour ", null, "", "five_hour", "weekly"],
        "": ["ignored"],
        bad: "not-an-array",
      },
      widgetPrivacy: "must-not-cross-stage-boundary",
    },
  });

  assert.deepEqual(getDashboardPrefs(), {
    version: 1,
    hiddenAccountKeys: ["codex:a", "grok:b"],
    hiddenWindowIdsByAccount: {
      "codex:a": ["five_hour", "weekly"],
    },
  });
});

test("fails closed on a future preference version without overwriting it", () => {
  const runtime = installStorage({
    value: {
      version: 2,
      hiddenAccountKeys: ["codex:a"],
      hiddenWindowIdsByAccount: {},
      futureField: "must-survive",
    },
  });

  assert.throws(() => getDashboardPrefs(), /总览偏好数据版本较新/);
  assert.throws(
    () => setAccountVisibleOnDashboard("codex:a", true),
    /总览偏好数据版本较新/,
  );
  assert.equal(runtime.writes(), 0);
  assert.deepEqual(runtime.values.get(STORAGE_KEY), {
    version: 2,
    hiddenAccountKeys: ["codex:a"],
    hiddenWindowIdsByAccount: {},
    futureField: "must-survive",
  });
});

test("round-trips account and window visibility and deletes empty buckets", () => {
  setAccountVisibleOnDashboard("codex:a", false);
  setWindowVisibleOnDashboard("codex:a", "five_hour", false);
  setWindowVisibleOnDashboard("codex:a", "weekly", false);
  assert.deepEqual(getDashboardPrefs(), {
    version: 1,
    hiddenAccountKeys: ["codex:a"],
    hiddenWindowIdsByAccount: {
      "codex:a": ["five_hour", "weekly"],
    },
  });

  setAccountVisibleOnDashboard("codex:a", true);
  setWindowVisibleOnDashboard("codex:a", "five_hour", true);
  setWindowVisibleOnDashboard("codex:a", "weekly", true);
  assert.deepEqual(getDashboardPrefs(), {
    version: 1,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
  });
});

test("reset restores the literal default document", () => {
  setDashboardPrefs({
    version: 1,
    hiddenAccountKeys: ["zai:a"],
    hiddenWindowIdsByAccount: { "zai:a": ["weekly"] },
  });
  assert.deepEqual(resetDashboardPrefs(), {
    version: 1,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
  });
});

test("hiding all accounts is reversible through the preference seam", () => {
  const first = card("codex:first", ["five_hour"]);
  const second = card("kimi:second", ["weekly"]);
  const hidden: DashboardPrefs = {
    version: 1,
    hiddenAccountKeys: [first.key, second.key],
    hiddenWindowIdsByAccount: {},
  };
  assert.deepEqual(applyDashboardPrefs([first, second], hidden), []);

  installStorage({ value: hidden });
  const restored = setAccountVisibleOnDashboard(second.key, true);
  assert.deepEqual(applyDashboardPrefs([first, second], restored), [second]);
});

test("filters only the display plane and preserves untouched card references", () => {
  const hidden = card("codex:hidden", ["five_hour"]);
  const unchanged = card("grok:unchanged", ["weekly"]);
  const trimmed = card("zai:trimmed", ["five_hour", "weekly"]);
  const prefs: DashboardPrefs = {
    version: 1,
    hiddenAccountKeys: [hidden.key],
    hiddenWindowIdsByAccount: { [trimmed.key]: ["weekly"] },
  };

  const filtered = applyDashboardPrefs([hidden, unchanged, trimmed], prefs);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0], unchanged);
  assert.notEqual(filtered[1], trimmed);
  assert.equal(filtered[1].windows.length, 1);
  assert.equal(filtered[1].windows[0], trimmed.windows[0]);
  assert.deepEqual(trimmed.windows.map((window) => window.id), ["five_hour", "weekly"]);
});

test("fails safe on read errors and returns sanitized state on write errors", () => {
  installStorage({ failGet: true });
  assert.deepEqual(getDashboardPrefs(), {
    version: 1,
    hiddenAccountKeys: [],
    hiddenWindowIdsByAccount: {},
  });

  const runtime = installStorage({ failSet: true });
  const result = setDashboardPrefs({
    version: 1,
    hiddenAccountKeys: [" codex:a ", "codex:a"],
    hiddenWindowIdsByAccount: {},
  });
  assert.deepEqual(result.hiddenAccountKeys, ["codex:a"]);
  assert.equal(runtime.writes(), 1);
  assert.equal(runtime.values.has(STORAGE_KEY), false);
});
