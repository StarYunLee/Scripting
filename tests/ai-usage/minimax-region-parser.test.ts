import assert from "node:assert/strict";
import test from "node:test";
import {
  hasMinimaxQuotaRows,
  parseMinimaxQuota,
} from "../../AI Usage/providers/minimax/usage-parser";

const fixedRows = [
  {
    model_name: "MiniMax-M2.7",
    current_interval_total_count: 100,
    current_interval_usage_count: 25,
    current_weekly_total_count: 1000,
    current_weekly_usage_count: 400,
    start_time: 1_800_000_000_000,
    end_time: 1_800_018_000_000,
    weekly_start_time: 1_800_000_000_000,
    weekly_end_time: 1_800_604_800_000,
    current_subscribe_title: "MiniMax Token Plan Max",
  },
];

test("rejects a cross-region success envelope with no quota rows", () => {
  assert.equal(
    hasMinimaxQuotaRows({ base_resp: { status_code: 0 }, model_remains: [] }),
    false,
  );
  assert.equal(
    hasMinimaxQuotaRows({
      base_resp: { status_code: 0 },
      data: { model_remains: [] },
    }),
    false,
  );
  assert.equal(
    hasMinimaxQuotaRows({
      base_resp: { status_code: 0 },
      model_remains: fixedRows,
    }),
    true,
  );
});

test("global payload treats usage_count as used rather than remaining", () => {
  const parsed = parseMinimaxQuota(
    { base_resp: { status_code: 0 }, model_remains: fixedRows },
    "intl",
  );
  assert.ok(parsed);
  assert.equal(parsed.fiveHour?.usedPercent, 25);
  assert.equal(parsed.fiveHour?.remainingPercent, 75);
  assert.equal(parsed.weekly?.usedPercent, 40);
  assert.equal(parsed.weekly?.remainingPercent, 60);
  assert.equal(parsed.planLabel, "Max");
});

test("China payload treats usage_count as remaining", () => {
  const parsed = parseMinimaxQuota(
    { base_resp: { status_code: 0 }, model_remains: fixedRows },
    "cn",
  );
  assert.ok(parsed);
  assert.equal(parsed.fiveHour?.usedPercent, 75);
  assert.equal(parsed.fiveHour?.remainingPercent, 25);
  assert.equal(parsed.weekly?.usedPercent, 60);
  assert.equal(parsed.weekly?.remainingPercent, 40);
});

test("parses nested non-empty model_remains and numeric strings", () => {
  const parsed = parseMinimaxQuota(
    {
      base_resp: { status_code: "0" },
      data: {
        model_remains: [
          {
            ...fixedRows[0],
            current_interval_total_count: "200",
            current_interval_usage_count: "50",
            current_weekly_total_count: "2000",
            current_weekly_usage_count: "500",
          },
        ],
      },
    },
    "intl",
  );
  assert.ok(parsed);
  assert.equal(parsed.fiveHour?.usedPercent, 25);
  assert.equal(parsed.weekly?.usedPercent, 25);
});
