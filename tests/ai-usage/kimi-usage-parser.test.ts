import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatKimiPlanLabel,
  parseKimiUsage,
} from "../../AI Usage/providers/kimi/usage-parser";

const reset = "2026-09-01T00:00:00.000Z";

test("parses the rolling quota and weekly quota from a fixed Kimi payload", () => {
  const parsed = parseKimiUsage({
    usage: { limit: 1000, used: 250, reset_time: 1788220800000 },
    limits: [
      {
        window: { duration: 5, timeUnit: "HOUR" },
        detail: { limit: 200, remaining: 150, resetAt: reset },
      },
    ],
    user: { membership: { level: "LEVEL_ADVANCED" } },
  });

  assert.deepEqual(parsed, {
    planLabel: "Allegro",
    fiveHour: {
      id: "kimi:rolling_18000",
      name: "five_hour",
      label: "5 小时",
      usedPercent: 25,
      remainingPercent: 75,
      resetAt: reset,
      resetAtMs: 1788220800000,
      windowSeconds: 18000,
    },
    weekly: {
      id: "kimi:weekly",
      name: "weekly",
      label: "每周",
      usedPercent: 25,
      remainingPercent: 75,
      resetAt: reset,
      resetAtMs: 1788220800000,
      windowSeconds: 604800,
    },
    windows: [
      {
        id: "kimi:rolling_18000",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 25,
        remainingPercent: 75,
        resetAt: reset,
        resetAtMs: 1788220800000,
        windowSeconds: 18000,
      },
      {
        id: "kimi:weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 25,
        remainingPercent: 75,
        resetAt: reset,
        resetAtMs: 1788220800000,
        windowSeconds: 604800,
      },
    ],
  });
});

test("chooses the shortest rolling limit as the focus window regardless of array order", () => {
  const parsed = parseKimiUsage({
    limits: [
      {
        window: { duration: 24, time_unit: "HOUR" },
        detail: { limit: 100, used: 80, reset_at: "2026-09-02T00:00:00Z" },
      },
      {
        window: { duration: 5, time_unit: "HOUR" },
        detail: { limit: 100, used: 20, reset_at: reset },
      },
    ],
  });
  assert.equal(parsed?.fiveHour?.id, "kimi:rolling_18000");
  assert.equal(parsed?.fiveHour?.usedPercent, 20);
  assert.equal(parsed?.windows[1].id, "kimi:rolling_86400");
});

test("treats a described zero-usage window as available but rejects malformed empty payloads", () => {
  const parsed = parseKimiUsage({
    limits: [{ window: { duration: 5, timeUnit: "HOUR" }, detail: {} }],
  });
  assert.equal(parsed?.fiveHour?.usedPercent, 0);
  assert.equal(parsed?.fiveHour?.remainingPercent, 100);
  assert.equal(parseKimiUsage({ limits: [{ detail: {} }] }), null);
});

test("maps observed LEVEL membership values without speculative pro or ultra aliases", () => {
  assert.equal(formatKimiPlanLabel("LEVEL_FREE"), "Free");
  assert.equal(formatKimiPlanLabel("LEVEL_BASIC"), "Adagio");
  assert.equal(formatKimiPlanLabel("LEVEL_STANDARD"), "Moderato");
  assert.equal(formatKimiPlanLabel("LEVEL_INTERMEDIATE"), "Allegretto");
  assert.equal(formatKimiPlanLabel("LEVEL_ADVANCED"), "Allegro");
  assert.equal(formatKimiPlanLabel("LEVEL_PREMIUM"), "Vivace");
  assert.equal(formatKimiPlanLabel("pro"), "pro");
  assert.equal(formatKimiPlanLabel("ultra"), "ultra");
});
