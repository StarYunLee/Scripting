import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseMinimaxRegion,
  type MinimaxRegionProbe,
} from "../../AI Usage/providers/minimax/region-selection";

const quotaPayload = {
  base_resp: { status_code: 0 },
  model_remains: [{ model_name: "MiniMax-M2.7" }],
};

test("falls through an empty international response to a valid China response", async () => {
  const calls: string[] = [];
  const probe: MinimaxRegionProbe = async (region) => {
    calls.push(region);
    return region === "intl"
      ? { base_resp: { status_code: 0 }, model_remains: [] }
      : quotaPayload;
  };
  assert.equal(await chooseMinimaxRegion(null, probe), "cn");
  assert.deepEqual(calls, ["intl", "cn"]);
});

test("preserves an explicit China selection as first choice", async () => {
  const calls: string[] = [];
  const probe: MinimaxRegionProbe = async (region) => {
    calls.push(region);
    return quotaPayload;
  };
  assert.equal(await chooseMinimaxRegion("cn", probe), "cn");
  assert.deepEqual(calls, ["cn"]);
});

test("rejects both regions when neither has a real quota row", async () => {
  const probe: MinimaxRegionProbe = async () => ({
    base_resp: { status_code: 0 },
    model_remains: [],
  });
  assert.equal(await chooseMinimaxRegion(null, probe), null);
});
