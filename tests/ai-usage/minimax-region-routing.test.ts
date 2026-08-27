import assert from "node:assert/strict";
import test from "node:test";
import {
  consoleUrlForRegion,
  quotaUrls,
  regionProbeOrder,
} from "../../AI Usage/providers/minimax/regions";

test("keeps domestic and international console choices explicit", () => {
  assert.equal(
    consoleUrlForRegion("intl"),
    "https://platform.minimax.io/user-center/payment/token-plan",
  );
  assert.equal(
    consoleUrlForRegion("cn"),
    "https://platform.minimaxi.com/user-center/payment/token-plan",
  );
});

test("uses separate quota hosts and preserves a selected region first", () => {
  assert.deepEqual(regionProbeOrder("cn"), ["cn", "intl"]);
  assert.deepEqual(regionProbeOrder("intl"), ["intl", "cn"]);
  assert.deepEqual(regionProbeOrder(null), ["intl", "cn"]);
  assert.match(quotaUrls("intl")[0], /^https:\/\/api\.minimax\.io\//);
  assert.match(quotaUrls("cn")[0], /^https:\/\/api\.minimaxi\.com\//);
  assert.ok(quotaUrls("intl").every((url) => !url.includes("minimaxi.com")));
  assert.ok(quotaUrls("cn").every((url) => !url.includes("minimax.io")));
});
