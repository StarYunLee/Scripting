import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  getDemoWidgetResult,
  listDemoAccounts,
} from "../../AI Usage/services/demo";

beforeEach(() => {
  Object.assign(globalThis, {
    Storage: {
      get: () => undefined,
      set: () => true,
    },
  });
});

test("every provider has at least one demo widget account", () => {
  const providers = [
    "codex",
    "grok",
    "claude",
    "antigravity",
    "cursor",
    "kimi",
    "copilot",
    "zai",
    "minimax",
  ];
  for (const provider of providers) {
    const accounts = listDemoAccounts(provider as never);
    assert.ok(accounts.length > 0, `${provider} 缺少演示账号`);
  }
});

test("cursor demo result yields four typed windows for the multi layout", () => {
  const [account] = listDemoAccounts("cursor");
  const result = getDemoWidgetResult("cursor", account.id);
  assert.ok(result && result.ok);
  if (!result.ok) return;
  assert.deepEqual(
    result.snapshot.windows.map((window) => window.name),
    ["auto", "total", "api", "weekly"],
  );
  assert.deepEqual(
    result.snapshot.windows.map((window) => window.id),
    ["cursor:auto", "cursor:total", "cursor:api", "cursor:requests"],
    "Cursor demo ids must match the real parser so hidden-window settings behave identically",
  );
  for (const window of result.snapshot.windows) {
    assert.equal(typeof window.usedPercent, "number");
    assert.ok(window.resetAt);
  }
  assert.equal(result.snapshot.planLabel, "Demo");
});

test("kimi and copilot demo results are no longer null", () => {
  const kimi = getDemoWidgetResult("kimi", listDemoAccounts("kimi")[0].id);
  assert.ok(kimi && kimi.ok);
  if (kimi && kimi.ok) {
    assert.deepEqual(
      kimi.snapshot.windows.map((window) => window.name),
      ["five_hour", "weekly"],
    );
    assert.deepEqual(
      kimi.snapshot.windows.map((window) => window.id),
      ["kimi:rolling_18000", "kimi:weekly"],
    );
  }
  const copilot = getDemoWidgetResult(
    "copilot",
    listDemoAccounts("copilot")[0].id,
  );
  assert.ok(copilot && copilot.ok);
  if (copilot && copilot.ok) {
    assert.deepEqual(
      copilot.snapshot.windows.map((window) => window.name),
      ["credits", "chat", "completions"],
    );
    assert.deepEqual(
      copilot.snapshot.windows.map((window) => window.id),
      ["copilot:credits", "copilot:chat", "copilot:completions"],
    );
  }
});

test("new demo accounts use neutral plan labels without invented tiers", () => {
  for (const provider of ["cursor", "kimi", "copilot"] as const) {
    for (const account of listDemoAccounts(provider)) {
      assert.equal(account.name, "Demo");
    }
  }
});

test("demo ids still resolve through the shared account id guard", async () => {
  const { isDemoAccountId } = await import(
    "../../AI Usage/services/demo"
  );
  assert.ok(isDemoAccountId(listDemoAccounts("cursor")[0].id));
  assert.equal(getDemoWidgetResult("cursor", "real_account"), null);
});
