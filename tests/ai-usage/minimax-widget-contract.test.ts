import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../AI Usage/widget/minimax/UsageWidgetView.tsx", import.meta.url),
  "utf8",
);

test("MiniMax uses only the fixed dual-quota widget without extra capsules", () => {
  assert.doesNotMatch(
    source,
    /MinRemainingCapsule|最低剩余|SingleWindowView|widgetStyle|focusWindow/,
  );
});
