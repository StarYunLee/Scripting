import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatZaiPlanLabel,
  parseZaiQuota,
  parseZaiSubscription,
} from "../../AI Usage/providers/zai/usage-parser";

const fiveHourReset = "2026-09-03T00:00:00.000Z";
const weeklyReset = "2026-09-08T00:00:00.000Z";
const webSearchReset = "2026-10-01T00:00:00.000Z";

test("parses observed token and web-search limits from a fixed Z.ai payload", () => {
  const parsed = parseZaiQuota({
    success: true,
    data: {
      limits: [
        {
          type: "TIME_LIMIT",
          percentage: "12.5",
          nextResetTime: Date.parse(webSearchReset),
        },
        {
          type: "TOKENS_LIMIT",
          unit: 6,
          number: 7,
          percentage: 64,
          nextResetTime: Date.parse(weeklyReset),
        },
        {
          type: "TOKENS_LIMIT",
          unit: 3,
          number: 5,
          percentage: 27,
          nextResetTime: Date.parse(fiveHourReset),
        },
      ],
    },
  });

  assert.deepEqual(parsed, {
    fiveHour: {
      id: "zai:five_hour:2",
      name: "five_hour",
      label: "5 小时",
      usedPercent: 27,
      remainingPercent: 73,
      resetAt: fiveHourReset,
      resetAtMs: Date.parse(fiveHourReset),
      windowSeconds: 18000,
    },
    weekly: {
      id: "zai:weekly:1",
      name: "weekly",
      label: "每周",
      usedPercent: 64,
      remainingPercent: 36,
      resetAt: weeklyReset,
      resetAtMs: Date.parse(weeklyReset),
      windowSeconds: 604800,
    },
    monthly: null,
    windows: [
      {
        id: "zai:five_hour:2",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 27,
        remainingPercent: 73,
        resetAt: fiveHourReset,
        resetAtMs: Date.parse(fiveHourReset),
        windowSeconds: 18000,
      },
      {
        id: "zai:weekly:1",
        name: "weekly",
        label: "每周",
        usedPercent: 64,
        remainingPercent: 36,
        resetAt: weeklyReset,
        resetAtMs: Date.parse(weeklyReset),
        windowSeconds: 604800,
      },
      {
        id: "zai:web_search:0",
        name: "web_search",
        label: "Web Search",
        usedPercent: 12.5,
        remainingPercent: 87.5,
        resetAt: webSearchReset,
        resetAtMs: Date.parse(webSearchReset),
        windowSeconds: 2592000,
      },
    ],
  });
});

test("recognizes a monthly token limit without confusing it with web search", () => {
  const parsed = parseZaiQuota({
    data: {
      limits: [
        {
          type: "TOKENS_LIMIT",
          unit: 5,
          number: 1,
          percentage: 0,
          nextResetTime: Date.parse(webSearchReset),
        },
        {
          type: "TIME_LIMIT",
          percentage: 100,
          nextResetTime: Date.parse(webSearchReset),
        },
      ],
    },
  });
  assert.equal(parsed?.monthly?.name, "monthly");
  assert.equal(parsed?.monthly?.usedPercent, 0);
  assert.equal(parsed?.windows[1].name, "web_search");
  assert.equal(parsed?.windows[1].usedPercent, 100);
});

test("rejects malformed quota limits rather than guessing by array position", () => {
  assert.equal(
    parseZaiQuota({
      data: {
        limits: [
          { type: "TOKENS_LIMIT", unit: 99, number: 99, percentage: 20 },
          { type: "UNKNOWN", percentage: 30 },
          { type: "TIME_LIMIT", percentage: "not-a-number" },
        ],
      },
    }),
    null,
  );
});

test("chooses the active subscription and preserves Pro+ suffix variants", () => {
  assert.equal(
    parseZaiSubscription({
      data: [
        { status: "EXPIRED", productName: "GLM Coding Max" },
        { status: "VALID", product_name: "年付 GLM Coding Pro+ Plan" },
      ],
    }),
    "Pro+",
  );
  assert.equal(formatZaiPlanLabel("GLM Coding Plan Pro+"), "Pro+");
  assert.equal(formatZaiPlanLabel("pro_plus"), "Pro+");
  assert.equal(formatZaiPlanLabel("GLM Coding Ultra"), "Ultra");
  assert.equal(parseZaiSubscription({ data: [] }), null);
});
