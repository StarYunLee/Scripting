import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isDashboardWidgetParameter,
  resolveWidgetParameter,
  WIDGET_DASHBOARD_PARAMETER,
} from "../../AI Usage/widget/parameter";

test("recognizes the dashboard parameter without changing account parameters", () => {
  assert.equal(WIDGET_DASHBOARD_PARAMETER, "dashboard");
  assert.equal(isDashboardWidgetParameter(" dashboard "), true);
  assert.equal(isDashboardWidgetParameter('"DASHBOARD"'), true);
  assert.deepEqual(resolveWidgetParameter("dashboard"), {
    mode: "dashboard",
    account: null,
    error: null,
  });

  const invalid = resolveWidgetParameter("not-an-account");
  assert.equal(invalid.mode, "account");
  assert.equal(invalid.account, null);
  assert.equal(invalid.error, "组件参数格式无效");
});
