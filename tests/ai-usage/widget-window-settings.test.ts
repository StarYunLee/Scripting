import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  clearWidgetWindowSettings,
  getWidgetWindowSettings,
  hasWidgetWindowSettings,
  setWidgetWindowSettings,
} from "../../AI Usage/services/widget-window-settings";

const KEY = "ai_usage_widget_window_settings_v1";

function installStorage(input?: { shared?: unknown; failSet?: boolean }) {
  const local = new Map<string, unknown>();
  const shared = new Map<string, unknown>();
  if (input && "shared" in input) shared.set(KEY, input.shared);
  Object.assign(globalThis, {
    Storage: {
      get(key: string, options?: { shared: boolean }) {
        return (options?.shared ? shared : local).get(key);
      },
      set(key: string, value: unknown, options?: { shared: boolean }) {
        if (input?.failSet) return false;
        (options?.shared ? shared : local).set(key, value);
        return true;
      },
    },
  });
  return { local, shared };
}

beforeEach(() => installStorage());

test("stores per-provider account hidden window ids in shared storage", () => {
  const runtime = installStorage();
  assert.deepEqual(getWidgetWindowSettings("claude", "acct"), {
    hiddenWindowIds: [],
  });
  assert.equal(
    setWidgetWindowSettings("claude", "acct", {
      hiddenWindowIds: ["claude:weekly", "", "claude:weekly", "future:id"],
    }),
    true,
  );
  assert.deepEqual(getWidgetWindowSettings("claude", "acct"), {
    hiddenWindowIds: ["claude:weekly", "future:id"],
  });
  assert.equal(runtime.local.has(KEY), false);
  assert.ok(runtime.shared.has(KEY));
});

test("tracks explicit show-all separately from an absent account setting", () => {
  assert.equal(hasWidgetWindowSettings("cursor", "acct"), false);
  assert.equal(
    setWidgetWindowSettings("cursor", "acct", { hiddenWindowIds: [] }),
    true,
  );
  assert.equal(hasWidgetWindowSettings("cursor", "acct"), true);
  assert.deepEqual(getWidgetWindowSettings("cursor", "acct"), {
    hiddenWindowIds: [],
  });
});

test("isolates accounts and providers and returns defensive copies", () => {
  setWidgetWindowSettings("claude", "one", { hiddenWindowIds: ["weekly"] });
  setWidgetWindowSettings("cursor", "one", { hiddenWindowIds: ["total"] });
  const first = getWidgetWindowSettings("claude", "one");
  first.hiddenWindowIds.push("mutated");
  assert.deepEqual(getWidgetWindowSettings("claude", "one"), {
    hiddenWindowIds: ["weekly"],
  });
  assert.deepEqual(getWidgetWindowSettings("cursor", "one"), {
    hiddenWindowIds: ["total"],
  });
});

test("a rejected write cannot poison subsequent reads", () => {
  const runtime = installStorage();
  assert.equal(
    setWidgetWindowSettings("zai", "acct", { hiddenWindowIds: ["monthly"] }),
    true,
  );
  const persisted = runtime.shared.get(KEY);
  installStorage({ shared: persisted, failSet: true });
  assert.equal(
    setWidgetWindowSettings("zai", "acct", { hiddenWindowIds: ["weekly"] }),
    false,
  );
  assert.deepEqual(getWidgetWindowSettings("zai", "acct"), {
    hiddenWindowIds: ["monthly"],
  });
});

test("clears only the deleted account settings", () => {
  setWidgetWindowSettings("kimi", "one", { hiddenWindowIds: ["weekly"] });
  setWidgetWindowSettings("kimi", "two", { hiddenWindowIds: ["five_hour"] });
  clearWidgetWindowSettings("kimi", "one");
  assert.deepEqual(getWidgetWindowSettings("kimi", "one"), {
    hiddenWindowIds: [],
  });
  assert.deepEqual(getWidgetWindowSettings("kimi", "two"), {
    hiddenWindowIds: ["five_hour"],
  });
});
