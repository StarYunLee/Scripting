import assert from "node:assert/strict";
import { test } from "node:test";
import type { UsageCard } from "../../AI Usage/models";
import type { RefreshOutcome } from "../../AI Usage/services/refresh";
import { mergeDashboardRefreshOutcomes } from "../../AI Usage/services/dashboard-widget-refresh";

function card(key: string, source: UsageCard["source"] = "cache"): UsageCard {
  const [provider, accountId] = key.split(":") as [UsageCard["provider"], string];
  return {
    key,
    provider,
    accountId,
    title: key,
    planLabel: null,
    authorized: true,
    windows: [],
    resetCredits: null,
    fetchedAt: null,
    source,
    refreshing: false,
  };
}

test("rebuilds successful dashboard cards preserves order and marks failures", () => {
  const cards = [card("codex:a"), card("grok:b"), card("kimi:c")];
  const outcomes: RefreshOutcome[] = [
    { provider: "codex", profileId: "a", ok: true, source: "live" },
    {
      provider: "grok",
      profileId: "b",
      ok: false,
      error: { message: "offline", code: "network" },
    },
    { provider: "kimi", profileId: "c", ok: true, source: "cache" },
  ];
  const rebuilt: string[] = [];
  const merged = mergeDashboardRefreshOutcomes(cards, outcomes, (item, outcome) => {
    rebuilt.push(item.key);
    return { ...item, source: outcome.source || "live" };
  });

  assert.deepEqual(rebuilt, ["codex:a", "kimi:c"]);
  assert.deepEqual(merged.cards.map((item) => item.key), cards.map((item) => item.key));
  assert.equal(merged.cards[0].source, "live");
  assert.equal(merged.cards[1].source, "error");
  assert.equal(merged.cards[1].errorMessage, "offline");
  assert.equal(merged.cards[2].source, "cache");
  assert.equal(merged.hasErrors, true);
});

test("keeps the prior card when an outcome or rebuilt account disappears", () => {
  const first = card("zai:a");
  const second = card("minimax:b");
  const merged = mergeDashboardRefreshOutcomes(
    [first, second],
    [{ provider: "zai", profileId: "a", ok: true, source: "live" }],
    () => null,
  );
  assert.equal(merged.cards[0], first);
  assert.equal(merged.cards[1], second);
  assert.equal(merged.hasErrors, true);
});
