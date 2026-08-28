import assert from "node:assert/strict";
import { test } from "node:test";
import { codexPlanLabel } from "../../AI Usage/providers/codex/plan-label";

test("recognizes Pro from nested ChatGPT entitlement metadata", () => {
  assert.equal(
    codexPlanLabel({
      plan_type: "plus",
      subscription: { plan: "pro_5x" },
    }),
    "Pro",
  );
  assert.equal(
    codexPlanLabel({
      plan_type: "plus",
      account: { usage_multiplier: 20 },
    }),
    "Pro",
  );
});

test("keeps explicit ordinary tiers when no Pro entitlement signal exists", () => {
  assert.equal(codexPlanLabel({ plan_type: "plus" }), "Plus");
  assert.equal(codexPlanLabel({ plan_type: "pro" }), "Pro");
  assert.equal(codexPlanLabel({ plan_type: "edu_plus" }), "Education Plus");
  assert.equal(codexPlanLabel({}), null);
});

test("ignores unrelated nested multipliers outside verified entitlement paths", () => {
  assert.equal(
    codexPlanLabel({
      plan_type: "plus",
      experiment: { usage_multiplier: 20 },
      billing_preview: { multiplier: 5 },
    }),
    "Plus",
  );
});
