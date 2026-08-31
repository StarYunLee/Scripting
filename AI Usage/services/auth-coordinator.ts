import type { AuthSheet, ProviderId } from "../models";
import {
  clearWidgetRefreshMetadata,
  recordWidgetRefreshSuccess,
} from "./widget-refresh-metadata";
import type { ProviderCore } from "../providers/contracts";

export type AuthorizationPageMode = "present" | "openURL";

type CopilotAuthorizationState = {
  profileId: string;
  verificationUri: string;
  userCode: string;
};

type AuthCoordinatorLog = {
  level: "info" | "error";
  source: "app";
  category: "auth";
  event: string;
  provider: ProviderId;
  accountId?: string;
  message: string;
  code?: string;
};

export type AuthCoordinatorDependencies = {
  providerIds: readonly ProviderId[];
  getProvider(provider: ProviderId): ProviderCore;
  isDemoMode(): boolean;
  openAuthorizationPage(url: string): Promise<AuthorizationPageMode>;
  getCopilotAuthorizationState(): CopilotAuthorizationState | null;
  writeLog(input: AuthCoordinatorLog): void;
};

export type AuthStartResult =
  | { ok: true; sheet: AuthSheet; resumed: boolean }
  | { ok: false; message: string; sheet?: AuthSheet };

export type AuthCompletion = {
  provider: ProviderId;
  profileId: string;
};

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function pendingStatus(provider: ProviderId): string {
  if (provider === "minimax")
    return "存在未完成的 MiniMax 授权，请粘贴 Subscription Key";
  if (provider === "zai") return "存在未完成的 Z.ai 授权，请粘贴 API Key";
  if (provider === "cursor" || provider === "kimi")
    return "存在未完成的设备授权；完成浏览器登录后直接提交";
  return "存在未完成的授权，请粘贴回调地址或授权码";
}

function startedStatus(
  provider: ProviderId,
  mode: AuthorizationPageMode,
  providerInput?: string,
): string {
  if (provider === "minimax") {
    const site = providerInput === "cn" ? "国内站" : "国际站";
    return mode === "present"
      ? `关闭 ${site}控制台后，粘贴 Subscription Key`
      : `已打开 MiniMax ${site}控制台，复制 Subscription Key 后粘贴`;
  }
  if (provider === "zai")
    return mode === "present"
      ? "关闭控制台后，把 API Key 粘贴到下方并提交"
      : "已打开 API Key 控制台，复制 Key 后粘贴到下方并提交";
  if (provider === "cursor" || provider === "kimi")
    return mode === "present"
      ? "关闭授权页后，直接提交并完成授权"
      : "已在系统 Safari 打开授权页，完成登录后直接提交";
  return mode === "present"
    ? "关闭授权页后，把回调地址或授权码粘贴到下方"
    : "已在系统 Safari 打开授权页，完成后把回调地址或授权码粘贴到下方";
}

function copilotSheet(
  state: CopilotAuthorizationState,
  resumed: boolean,
): AuthSheet {
  return {
    provider: "copilot",
    profileId: state.profileId,
    authorizationInput: "",
    authorizationUrl: state.verificationUri,
    deviceCode: state.userCode,
    status: resumed
      ? "存在未完成的 GitHub 设备授权；请先复制设备码，再打开授权页"
      : "设备码已生成；请先复制，再打开 GitHub 授权页",
  };
}

export function createAuthCoordinator(
  dependencies: AuthCoordinatorDependencies,
) {
  let startInFlight: Promise<AuthStartResult> | null = null;
  let completeInFlight: Promise<AuthCompletion> | null = null;

  function findPending(): { provider: ProviderId; profileId: string } | null {
    for (const provider of dependencies.providerIds) {
      const api = dependencies.getProvider(provider);
      if (!api.auth.hasPending()) continue;
      const profileId = api.auth.pendingId();
      if (profileId) return { provider, profileId };
    }
    return null;
  }

  function resume(): AuthSheet | null {
    const pending = findPending();
    if (!pending) return null;
    if (pending.provider === "copilot") {
      const state = dependencies.getCopilotAuthorizationState();
      if (state) return copilotSheet(state, true);
    }
    return {
      provider: pending.provider,
      profileId: pending.profileId,
      authorizationInput: "",
      status: pendingStatus(pending.provider),
    };
  }

  async function performStart(options: {
    provider: ProviderId;
    profileId?: string;
    providerInput?: string;
  }): Promise<AuthStartResult> {
    if (dependencies.isDemoMode())
      return { ok: false, message: "演示模式不会发起真实授权" };

    const existing = resume();
    if (existing) return { ok: true, sheet: existing, resumed: true };

    const api = dependencies.getProvider(options.provider);
    const existingAccount = options.profileId
      ? api.list().find((account) => account.id === options.profileId) || null
      : null;
    if (options.profileId && !existingAccount) {
      return { ok: false, message: "要重新授权的账号不存在" };
    }

    let account = existingAccount;
    let createdHere = false;
    try {
      if (!account) {
        account = api.create();
        createdHere = true;
      }
      const url = await api.auth.start(account.id, options.providerInput);
      dependencies.writeLog({
        level: "info",
        source: "app",
        category: "auth",
        event: "auth.started",
        provider: options.provider,
        accountId: account.id,
        message: "授权流程已开始",
      });

      if (options.provider === "copilot") {
        const state = dependencies.getCopilotAuthorizationState();
        if (!state) {
          return {
            ok: false,
            message: "GitHub 设备码生成失败，请取消后重新开始",
            sheet: {
              provider: options.provider,
              profileId: account.id,
              authorizationInput: "",
              authorizationUrl: url,
              status: "设备码读取失败，请取消后重新开始",
            },
          };
        }
        return { ok: true, sheet: copilotSheet(state, false), resumed: false };
      }

      try {
        const mode = await dependencies.openAuthorizationPage(url);
        return {
          ok: true,
          resumed: false,
          sheet: {
            provider: options.provider,
            profileId: account.id,
            authorizationInput: "",
            authorizationUrl: url,
            status: startedStatus(
              options.provider,
              mode,
              options.providerInput,
            ),
          },
        };
      } catch (error) {
        return {
          ok: true,
          resumed: false,
          sheet: {
            provider: options.provider,
            profileId: account.id,
            authorizationInput: "",
            authorizationUrl: url,
            status: `无法打开授权页：${errorText(error)}。可点击下方按钮重试。`,
          },
        };
      }
    } catch (error) {
      let cleanupFailed = false;
      if (
        createdHere &&
        account &&
        !api.auth.hasPending() &&
        !api.token(account.id)
      ) {
        const removed = api.remove(account.id);
        cleanupFailed = !removed.ok;
        if (removed.ok) {
          api.usage.clearCache(account.id);
          api.clearSettings(account.id);
        }
      }
      dependencies.writeLog({
        level: "error",
        source: "app",
        category: "auth",
        event: "auth.start_failed",
        provider: options.provider,
        accountId: account?.id,
        message: "启动授权失败",
        code: error instanceof Error ? error.name : "unknown",
      });
      return {
        ok: false,
        message:
          `启动授权失败：${errorText(error)}` +
          (cleanupFailed ? "；新建空账号未能自动清理" : ""),
      };
    }
  }

  function start(options: {
    provider: ProviderId;
    profileId?: string;
    providerInput?: string;
  }): Promise<AuthStartResult> {
    if (startInFlight)
      return Promise.resolve({
        ok: false,
        message: "授权流程正在启动，请勿重复操作",
      });
    const running = performStart(options);
    startInFlight = running;
    running.then(
      () => {
        if (startInFlight === running) startInFlight = null;
      },
      () => {
        if (startInFlight === running) startInFlight = null;
      },
    );
    return running;
  }

  async function performComplete(sheet: AuthSheet): Promise<AuthCompletion> {
    if (dependencies.isDemoMode()) throw new Error("演示模式不会完成真实授权");
    try {
      await dependencies
        .getProvider(sheet.provider)
        .auth.complete(sheet.authorizationInput);
      const authorizedAt = new Date().toISOString();
      recordWidgetRefreshSuccess(sheet.provider, sheet.profileId, authorizedAt);
      dependencies.writeLog({
        level: "info",
        source: "app",
        category: "auth",
        event: "auth.succeeded",
        provider: sheet.provider,
        accountId: sheet.profileId,
        message: "授权成功",
      });
      return { provider: sheet.provider, profileId: sheet.profileId };
    } catch (error) {
      dependencies.writeLog({
        level: "error",
        source: "app",
        category: "auth",
        event: "auth.failed",
        provider: sheet.provider,
        accountId: sheet.profileId,
        message: "授权失败",
        code: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  }

  function complete(sheet: AuthSheet): Promise<AuthCompletion> {
    if (completeInFlight) return completeInFlight;
    const running = performComplete(sheet);
    completeInFlight = running;
    running.then(
      () => {
        if (completeInFlight === running) completeInFlight = null;
      },
      () => {
        if (completeInFlight === running) completeInFlight = null;
      },
    );
    return running;
  }

  function cancel(sheet: AuthSheet): void {
    if (completeInFlight) throw new Error("授权正在验证，请稍候");
    const api = dependencies.getProvider(sheet.provider);
    api.auth.clearPending();
    if (api.token(sheet.profileId)) return;
    const removed = api.remove(sheet.profileId);
    if (!removed.ok) throw new Error("授权已取消，但未授权账号清理失败");
    api.usage.clearCache(sheet.profileId);
    clearWidgetRefreshMetadata(sheet.provider, sheet.profileId);
    api.clearSettings(sheet.profileId);
  }

  return { findPending, resume, start, complete, cancel };
}

export type AuthCoordinator = ReturnType<typeof createAuthCoordinator>;
