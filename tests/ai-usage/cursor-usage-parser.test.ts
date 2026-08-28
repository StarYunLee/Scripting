import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCursorCurrentUsage,
  parseCursorLegacyUsage,
  parseCursorSandUsage,
} from "../../AI Usage/providers/cursor/usage-parser";

const plan = {
  planLabel: "Cursor Pro",
  includedAmountCents: 2000,
  billingCycleEnd: "2026-09-01T00:00:00.000Z",
};

test("parses Auto Total and API windows with a unix-millisecond reset", () => {
  const result = parseCursorCurrentUsage(
    {
      billingCycleEnd: 1788220800000,
      planUsage: {
        autoPercentUsed: 12.5,
        totalPercentUsed: 46,
        apiPercentUsed: 8,
      },
    },
    plan,
  );

  assert.deepEqual(result, {
    planLabel: "Cursor Pro",
    windows: [
      {
        id: "cursor:auto",
        name: "auto",
        label: "Auto",
        usedPercent: 12.5,
        remainingPercent: 87.5,
        resetAt: "2026-09-01T00:00:00.000Z",
        resetAtMs: 1788220800000,
        windowSeconds: null,
      },
      {
        id: "cursor:total",
        name: "total",
        label: "Total",
        usedPercent: 46,
        remainingPercent: 54,
        resetAt: "2026-09-01T00:00:00.000Z",
        resetAtMs: 1788220800000,
        windowSeconds: null,
      },
      {
        id: "cursor:api",
        name: "api",
        label: "API",
        usedPercent: 8,
        remainingPercent: 92,
        resetAt: "2026-09-01T00:00:00.000Z",
        resetAtMs: 1788220800000,
        windowSeconds: null,
      },
    ],
  });
});

test("falls back to included spend when total percent is absent", () => {
  const result = parseCursorCurrentUsage(
    {
      planUsage: { includedSpend: 500 },
      displayMessage: "You've used 99% of your usage limit",
    },
    plan,
  );
  assert.equal(result?.windows[0].name, "total");
  assert.equal(result?.windows[0].usedPercent, 25);
});

test("parses Grok Bot included weekly usage and ignores zero-limit payloads", () => {
  assert.deepEqual(
    parseCursorSandUsage({
      hasNonZeroIncludedLimit: true,
      includedLimit: 100,
      usagePercent: 31,
      currentPeriodStart: "2026-08-25T00:00:00Z",
      nextResetTimestampUtc: "2026-09-01T00:00:00Z",
    }),
    {
      id: "cursor:grok_bot",
      name: "grok_bot",
      label: "Grok Bot",
      usedPercent: 31,
      remainingPercent: 69,
      resetAt: "2026-09-01T00:00:00.000Z",
      resetAtMs: 1788220800000,
      windowSeconds: 604800,
    },
  );
  assert.equal(
    parseCursorSandUsage({ includedLimit: 0, usagePercent: 31 }),
    null,
  );
});

test("parses the legacy request bucket without depending on object order", () => {
  const result = parseCursorLegacyUsage({
    startOfMonth: "2026-08-01T00:00:00Z",
    other: { numRequests: 99, maxRequestUsage: 100 },
    "gpt-4": { numRequests: 25, maxRequestUsage: 100 },
  });
  assert.equal(result?.planLabel, "Enterprise");
  assert.equal(result?.windows[0].usedPercent, 25);
  assert.equal(result?.windows[0].label, "请求额度");
});

test("legacy bucket label comes from the canonical copy table", async () => {
  const { readFile } = await import("node:fs/promises");
  const parser = await readFile(
    new URL(
      "../../AI Usage/providers/cursor/usage-parser.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(parser, /CURSOR_WINDOW\.REQUEST/);
  assert.doesNotMatch(parser, /makeWindow\(\s*"weekly",\s*"[^"]+"/);
});
