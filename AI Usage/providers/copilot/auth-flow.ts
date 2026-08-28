export type CopilotAuthorizationState = {
  profileId: string;
  verificationUri: string;
  userCode: string;
};

export type CopilotAuthorizationPlan = {
  profileId: string;
  deviceCode: string;
  status: string;
  openAuthorizationPage: false;
};

export function planCopilotAuthorization(
  state: CopilotAuthorizationState,
): CopilotAuthorizationPlan {
  return {
    profileId: state.profileId,
    deviceCode: state.userCode,
    status: "设备码已生成；请先复制，再手动打开 GitHub 授权页",
    openAuthorizationPage: false,
  };
}

export function planPendingCopilotAuthorization(
  state: CopilotAuthorizationState,
): CopilotAuthorizationPlan {
  return {
    profileId: state.profileId,
    deviceCode: state.userCode,
    status: "存在未完成的 GitHub 设备授权；请先复制设备码，再手动打开授权页",
    openAuthorizationPage: false,
  };
}
