import test from "node:test";
import assert from "node:assert/strict";

(globalThis as { Storage?: unknown }).Storage = {
  get() {
    return undefined;
  },
  set() {},
};

test("MiniMax demo account exposes a native region-aware widget result", async () => {
  const demo = await import("../../AI Usage/services/demo");
  const accounts = demo.listDemoAccounts("minimax");
  assert.ok(accounts.length > 0);
  const result = demo.getDemoWidgetResult("minimax", accounts[0].id);
  assert.equal(result?.ok, true);
  if (!result?.ok) return;
  assert.equal(result.snapshot.region, "intl");
  assert.ok(result.snapshot.fiveHour);
  assert.ok(result.snapshot.weekly);
});
