/**
 * P0-2 回归：仅有 window 描述、缺用量字段时不得伪造 used=0。
 * 运行：npx --yes tsx "AI Usage/providers/kimi/usage-parser.p0.regression.ts"
 */
import { parseKimiUsage } from "./usage-parser";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const windowOnly = parseKimiUsage({
  limits: [
    {
      window: { duration: 5, timeUnit: "HOUR" },
      detail: {},
    },
  ],
});
assert(
  windowOnly == null,
  "P0-2: window descriptor without usage must not invent usedPercent=0",
);

const withUsage = parseKimiUsage({
  limits: [
    {
      window: { duration: 5, timeUnit: "HOUR" },
      detail: { limit: 100, used: 30 },
    },
  ],
});
assert(withUsage?.fiveHour != null, "limit+used should parse rolling window");
assert(
  withUsage!.fiveHour!.usedPercent === 30,
  `expected used 30%, got ${withUsage!.fiveHour!.usedPercent}`,
);
assert(
  withUsage!.fiveHour!.remainingPercent === 70,
  `expected remaining 70%, got ${withUsage!.fiveHour!.remainingPercent}`,
);

console.log("kimi usage-parser P0-2 regression: PASS");
