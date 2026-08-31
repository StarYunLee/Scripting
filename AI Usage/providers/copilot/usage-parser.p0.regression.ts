/**
 * P0-1 回归：缺 entitlement 时不得把未知进度写成 0%。
 * 运行：npx --yes tsx "AI Usage/providers/copilot/usage-parser.p0.regression.ts"
 */
import { parseCopilotUsage } from "./usage-parser";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const remainingOnly = parseCopilotUsage({
  quota_snapshots: {
    premium_interactions: { remaining: 20 },
  },
  quota_reset_date_utc: "2026-09-01T00:00:00Z",
});
assert(
  remainingOnly == null || remainingOnly.credits == null,
  "P0-1: remaining-only snapshot must not invent a 0% window",
);

const derivedOk = parseCopilotUsage({
  quota_snapshots: {
    premium_interactions: { entitlement: 100, remaining: 40 },
  },
  quota_reset_date_utc: "2026-09-01T00:00:00Z",
});
assert(derivedOk?.credits != null, "entitlement+remaining should parse");
assert(
  derivedOk!.credits!.remainingPercent === 40,
  `expected 40% remaining, got ${derivedOk!.credits!.remainingPercent}`,
);

const explicitOk = parseCopilotUsage({
  quota_snapshots: {
    premium_interactions: { percent_remaining: 25 },
  },
});
assert(explicitOk?.credits != null, "percent_remaining alone should parse");
assert(
  explicitOk!.credits!.remainingPercent === 25,
  `expected 25% remaining, got ${explicitOk!.credits!.remainingPercent}`,
);

console.log("copilot usage-parser P0-1 regression: PASS");
