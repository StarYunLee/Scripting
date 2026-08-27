import assert from "node:assert/strict";
import test from "node:test";
import {
  planCopilotAuthorization,
  planPendingCopilotAuthorization,
} from "../../AI Usage/providers/copilot/auth-flow";

test("generating a Copilot device code shows it before any browser opens", () => {
  assert.deepEqual(
    planCopilotAuthorization({
      profileId: "copilot-1",
      verificationUri: "https://github.com/login/device",
      userCode: "ABCD-EFGH",
    }),
    {
      profileId: "copilot-1",
      deviceCode: "ABCD-EFGH",
      status: "设备码已生成；请先复制，再手动打开 GitHub 授权页",
      openAuthorizationPage: false,
    },
  );
});

test("resuming a pending Copilot login keeps authorization page manual", () => {
  assert.deepEqual(
    planPendingCopilotAuthorization({
      profileId: "copilot-1",
      verificationUri: "https://github.com/login/device",
      userCode: "ABCD-EFGH",
    }),
    {
      profileId: "copilot-1",
      deviceCode: "ABCD-EFGH",
      status: "存在未完成的 GitHub 设备授权；请先复制设备码，再手动打开授权页",
      openAuthorizationPage: false,
    },
  );
});
