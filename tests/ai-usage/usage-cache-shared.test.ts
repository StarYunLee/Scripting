import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUsageCache,
} from "../../AI Usage/services/usage-cache";
import {
  cacheFirstResult,
  decideUsageCache,
  partitionDashboardCards,
  selectAutoRefreshTargets,
  shouldServeCache,
} from "../../AI Usage/services/refresh-policy";

type Snapshot = { fetchedAt: string; source: "live" | "cache"; windows: number };

/** Two-domain Storage mock: local (default) vs shared ({shared:true}). */
function makeStorage() {
  const local = new Map<string, unknown>();
  const shared = new Map<string, unknown>();
  const calls = { sharedReads: 0, localReads: 0, sharedWrites: 0, localWrites: 0 };
  const Storage = {
    get<T>(_key: string, options?: { shared?: boolean }): T | undefined {
      if (options?.shared) {
        calls.sharedReads += 1;
        return shared.get(_key) as T | undefined;
      }
      calls.localReads += 1;
      return local.get(_key) as T | undefined;
    },
    set(_key: string, value: unknown, options?: { shared?: boolean }): boolean {
      if (options?.shared) {
        calls.sharedWrites += 1;
        shared.set(_key, JSON.parse(JSON.stringify(value)));
      } else {
        calls.localWrites += 1;
        local.set(_key, JSON.parse(JSON.stringify(value)));
      }
      return true;
    },
    remove(_key: string, options?: { shared?: boolean }): boolean {
      if (options?.shared) shared.delete(_key);
      else local.delete(_key);
      return true;
    },
  };
  return { Storage, local, shared, calls };
}

function withStorage<T>(fn: (s: ReturnType<typeof makeStorage>) => T): T {
  const store = makeStorage();
  const previous = (globalThis as Record<string, unknown>).Storage;
  (globalThis as Record<string, unknown>).Storage = store.Storage;
  try {
    return fn(store);
  } finally {
    if (previous === undefined)
      delete (globalThis as Record<string, unknown>).Storage;
    else (globalThis as Record<string, unknown>).Storage = previous;
  }
}

function makeCache() {
  return createUsageCache<Snapshot>({
    keyPrefix: "ai_usage_test_cache_v1_",
    resolveProfileId: (profileId) => profileId || null,
    recentMs: 3 * 60_000,
  });
}

const NOW = 1_000_000_000_000;
const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

function makeCacheWithNow() {
  return createUsageCache<Snapshot>({
    keyPrefix: "ai_usage_test_cache_v1_",
    resolveProfileId: (profileId) => profileId || null,
    recentMs: 3 * 60_000,
    now: () => NOW,
  });
}

test("decideUsageCache keeps the recent-window short circuit", () => {
  const decision = decideUsageCache({
    force: false,
    hasCache: true,
    fetchedAt: iso(60_000),
    now: NOW,
    recentMs: 3 * 60_000,
  });
  assert.deepEqual(decision, { useCache: true, reason: "recent" });
});

test("decideUsageCache forces network past the recent window", () => {
  const decision = decideUsageCache({
    force: false,
    hasCache: true,
    fetchedAt: iso(10 * 60_000),
    now: NOW,
    recentMs: 3 * 60_000,
  });
  assert.deepEqual(decision, { useCache: false, reason: "stale" });
});

test("decideUsageCache never serves cache on force and never blocks on missing cache", () => {
  assert.deepEqual(
    decideUsageCache({
      force: true,
      hasCache: true,
      fetchedAt: iso(0),
      now: NOW,
      recentMs: 3 * 60_000,
    }),
    { useCache: false, reason: "forced" },
  );
  assert.deepEqual(
    decideUsageCache({
      force: false,
      hasCache: false,
      fetchedAt: null,
      now: NOW,
      recentMs: 3 * 60_000,
    }),
    { useCache: false, reason: "no-cache" },
  );
});

test("cacheFirstResult serves the cache without touching fetch", async () => {
  let fetchCalls = 0;
  const result = await cacheFirstResult<Snapshot, { ok: true; snapshot: Snapshot }>(
    { fetchedAt: iso(10 * 60_000), source: "cache", windows: 7 },
    () => {
      fetchCalls += 1;
      return Promise.resolve({ ok: true, snapshot: { fetchedAt: iso(0), source: "live", windows: 0 } });
    },
  );
  assert.equal(fetchCalls, 0);
  assert.deepEqual(result, {
    ok: true,
    snapshot: { fetchedAt: iso(10 * 60_000), source: "cache", windows: 7 },
  });
});

test("cacheFirstResult falls through to fetch when there is no cache", async () => {
  const result = await cacheFirstResult<Snapshot, { ok: true; snapshot: Snapshot }>(
    null,
    () =>
      Promise.resolve({ ok: true, snapshot: { fetchedAt: iso(0), source: "live", windows: 2 } }),
  );
  assert.deepEqual(result, {
    ok: true,
    snapshot: { fetchedAt: iso(0), source: "live", windows: 2 },
  });
});

test("shouldServeCache agrees with decideUsageCache and tolerates missing options", () => {
  // shouldServeCache reads the wall clock itself; anchor freshness to it.
  const stale = {
    fetchedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  } as Snapshot;
  const fresh = {
    fetchedAt: new Date(Date.now() - 60_000).toISOString(),
  } as Snapshot;
  assert.equal(shouldServeCache(stale, { force: false }, 3 * 60_000), false);
  assert.equal(shouldServeCache(stale, { force: true }, 3 * 60_000), false);
  assert.equal(shouldServeCache(fresh, { force: false }, 3 * 60_000), true);
  assert.equal(shouldServeCache(fresh, { force: true }, 3 * 60_000), false);
  assert.equal(shouldServeCache(null, { force: false }, 3 * 60_000), false);
});

test("cache writes go to the shared domain only", () => {
  withStorage((store) => {
    const cache = makeCache();
    cache.write("acct_a", { fetchedAt: iso(0), source: "live", windows: 1 });
    assert.equal(store.shared.size, 1);
    assert.equal(store.local.size, 0);
    assert.equal(store.calls.sharedWrites, 1);
    assert.equal(store.calls.localWrites, 0);
  });
});

test("read migrates a legacy local-domain snapshot into shared", () => {
  withStorage((store) => {
    store.local.set("ai_usage_test_cache_v1_acct_a", {
      fetchedAt: iso(60_000),
      source: "cache",
      windows: 3,
    });
    const cache = makeCacheWithNow();
    const snapshot = cache.read("acct_a");
    assert.ok(snapshot, "legacy local snapshot should be readable");
    assert.equal(snapshot!.windows, 3);
    assert.equal(snapshot!.source, "cache");
    assert.equal(store.shared.has("ai_usage_test_cache_v1_acct_a"), true);
  });
});

test("read rejects legacy snapshots without a valid fetchedAt", () => {
  withStorage((store) => {
    store.local.set("ai_usage_test_cache_v1_acct_bad", {
      source: "cache",
      windows: 3,
    });
    const cache = makeCacheWithNow();
    assert.equal(cache.read("acct_bad"), null);
    assert.equal(store.shared.has("ai_usage_test_cache_v1_acct_bad"), false);
  });
});

test("read rejects legacy snapshots whose fetchedAt is a truthy but unparseable date", () => {
  withStorage((store) => {
    store.local.set("ai_usage_test_cache_v1_acct_nandate", {
      fetchedAt: "not-a-date",
      source: "cache",
      windows: 3,
    });
    const cache = makeCacheWithNow();
    assert.equal(cache.read("acct_nandate"), null);
    // 本地坏日期不得被 migrate-on-read 带入 shared 域。
    assert.equal(store.shared.has("ai_usage_test_cache_v1_acct_nandate"), false);
  });
});

test("read rejects shared snapshots with an invalid fetchedAt date", () => {
  withStorage((store) => {
    store.shared.set("ai_usage_test_cache_v1_acct_nandate2", {
      fetchedAt: "not-a-date",
      source: "cache",
      windows: 3,
    });
    const cache = makeCacheWithNow();
    assert.equal(cache.read("acct_nandate2"), null);
    // shared miss 后不得退回读取任何 local 旧值（本用例 local 为空）。
  });
});

test("read sees cross-context shared writes on every call (no negative tombstone)", () => {
  withStorage((store) => {
    const cache = makeCache();
    // App 上下文先 miss。
    assert.equal(cache.read("acct_a"), null);
    // 另一上下文（widget/intent）随后写入 shared。
    store.shared.set("ai_usage_test_cache_v1_acct_a", {
      fetchedAt: iso(60_000),
      source: "cache",
      windows: 9,
    });
    // 长驻 App 必须立即读到，而不是永远 null。
    const snapshot = cache.read("acct_a");
    assert.ok(snapshot, "shared write must be visible after an earlier miss");
    assert.equal(snapshot!.windows, 9);
  });
});

test("clear removes both shared and legacy local domains", () => {
  withStorage((store) => {
    store.local.set("ai_usage_test_cache_v1_acct_a", {
      fetchedAt: iso(0),
      source: "cache",
      windows: 1,
    });
    const cache = makeCache();
    cache.write("acct_a", { fetchedAt: iso(0), source: "live", windows: 2 });
    cache.clear("acct_a");
    assert.equal(store.shared.has("ai_usage_test_cache_v1_acct_a"), false);
    assert.equal(store.local.has("ai_usage_test_cache_v1_acct_a"), false);
  });
});

test("selectAutoRefreshTargets keeps only accounts without cache or beyond reloadMinutes", () => {
  const candidates = [
    { provider: "codex" as const, profileId: "no-cache", fetchedAt: null },
    { provider: "grok" as const, profileId: "fresh", fetchedAt: iso(60_000) },
    {
      provider: "claude" as const,
      profileId: "stale",
      fetchedAt: iso(45 * 60_000),
    },
    {
      provider: "kimi" as const,
      profileId: "invalid",
      fetchedAt: "not-a-date",
    },
  ];
  const targets = selectAutoRefreshTargets(candidates, {
    now: NOW,
    reloadMinutes: 30,
  });
  assert.deepEqual(
    targets.map((t) => t.profileId),
    ["no-cache", "stale", "invalid"],
  );
});

test("partitionDashboardCards splits cached from missing cards", () => {
  const cards = [
    { key: "a", fetchedAt: iso(60_000), source: "cache" },
    { key: "b", fetchedAt: null, source: "empty" },
    { key: "c", fetchedAt: iso(60_000), source: "live" },
    { key: "d", fetchedAt: "not-a-date", source: "cache" },
    { key: "e", fetchedAt: iso(60_000), source: "error" },
  ];
  const { cached, missing } = partitionDashboardCards(cards);
  assert.deepEqual(
    cached.map((c) => c.key),
    ["a", "c"],
  );
  assert.deepEqual(
    missing.map((c) => c.key),
    ["b", "d", "e"],
  );
});
