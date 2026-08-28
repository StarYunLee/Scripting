import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

const PROVIDERS = [
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

test("usage cache persists in the shared domain without widget-unsafe syntax", async () => {
  const cache = await source("services/usage-cache.ts");
  assert.match(cache, /\{\s*shared:\s*true\s*\}/);
  assert.doesNotMatch(cache, /^\s*export\s*\{/m);
  assert.doesNotMatch(cache, /\)\s*:\s*[^\n{]+\sis\s/);
});

test("refresh policy stays a dependency-free pure seam module", async () => {
  const policy = await source("services/refresh-policy.ts");
  assert.match(policy, /export function decideUsageCache/);
  assert.match(policy, /export function shouldServeCache/);
  assert.match(policy, /export function selectAutoRefreshTargets/);
  assert.match(policy, /export function cacheFirstResult/);
  // Zero imports: nothing from providers/, scripting or any runtime module.
  assert.doesNotMatch(policy, /^\s*import\s/m);
  assert.doesNotMatch(policy, /from\s+"/);
});

for (const provider of PROVIDERS) {
  test(`${provider} cache goes through createUsageCache with the shared decision seam`, async () => {
    const api = await source(`providers/${provider}/api.ts`);
    assert.match(api, /createUsageCache/);
    assert.match(api, /shouldServeCache/);
    assert.match(api, /shouldServeCache\s*\}\s*from "\.\.\/\.\.\/services\/refresh-policy"/);
    // The usage snapshot itself must not bypass the shared cache helper.
    assert.doesNotMatch(api, /Storage\.get<UsageSnapshot>/);
    assert.doesNotMatch(api, /Storage\.set\(\s*cacheKey/);
    // The provider fetch contract stays narrow: no source parameter.
    assert.doesNotMatch(api, /source\?:/);
    assert.doesNotMatch(api, /"app-auto"/);
  });
}

test("single-account widget loaders are cache-first without network on cache hit", async () => {
  const loader = await source("widget/loader.ts");
  const calls =
    loader.match(
      /cacheFirstResult\(\s*get\w+Cache\(profileId\),\s*\(\)\s*=>\s*fetch\w+Usage\(\{\s*force:\s*false,\s*profileId\s*\}\),?\s*\)/g,
    ) || [];
  assert.equal(
    calls.length,
    9,
    "every provider fetch closure must go through cacheFirstResult",
  );
  // Loader-level cache-first replaces any source-based widening of fetch.
  assert.doesNotMatch(loader, /fetch\w+Usage\(\{[^}]*source/);
  assert.doesNotMatch(loader, /force:\s*true/);
});

test("dashboard widget keeps bounded cache-first refreshes", async () => {
  const loader = await source("widget/dashboard-loader.ts");
  assert.match(loader, /partitionDashboardCards\(selected\)/);
  assert.match(loader, /force:\s*false,\s*source:\s*"widget"/);
  // Only missing (no-cache) cards may go through refreshAccounts.
  assert.match(
    loader,
    /refreshAccounts\(\s*missing\.map/,
    "refreshAccounts must only receive missing cards",
  );
  assert.doesNotMatch(loader, /selected\.map\(\s*\(card\)\s*=>\s*\(\{\s*provider/);
  // No-missing path returns selected as-is with truthy hasErrors.
  assert.match(loader, /hasErrors:\s*selected\.some\(\(card\)\s*=>\s*card\.source\s*===\s*"error"\)/);
});

test("refresh keeps the approved source contract and does not widen fetch", async () => {
  const refresh = await source("services/refresh.ts");
  assert.match(refresh, /source: "app" \| "widget" \| "intent"/);
  assert.doesNotMatch(refresh, /"app-auto"/);
  assert.doesNotMatch(
    refresh,
    /provider\.fetch\(\{[\s\S]{0,120}?source/,
    "provider.fetch must stay force/profileId only",
  );
  const contracts = await source("providers/contracts.ts");
  assert.doesNotMatch(contracts, /source\?:/);
  assert.doesNotMatch(contracts, /"app-auto"/);
});

test("app first frame auto-refreshes only missing or stale accounts via app source", async () => {
  const status = await source("pages/StatusPage.tsx");
  assert.match(status, /selectAutoRefreshTargets/);
  assert.match(
    status,
    /reloadMinutes:\s*getAppDisplaySettings\(\)\.reloadMinutes/,
    "automatic refresh cadence must come from the global reloadMinutes setting",
  );
  assert.match(status, /force:\s*false,\s*source:\s*"app"/);
  assert.doesNotMatch(status, /"app-auto"/);
});

test("manual app refresh and intents keep force true", async () => {
  const status = await source("pages/StatusPage.tsx");
  assert.match(status, /force:\s*true,\s*source:\s*"app"/);
  const intent = await source("intent.tsx");
  assert.match(intent, /force:\s*true/);
  const appIntents = await source("app_intents.tsx");
  assert.match(appIntents, /force:\s*true/);
});
