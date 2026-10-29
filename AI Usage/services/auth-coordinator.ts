import { AuthorizationCheckDeferred } from "./auth-single-check";
import { retireAccountWork } from "./account-work-guard";
import type { AuthSheet, ProviderId } from "../models";
import {
  createAuthorizationAbort,
  AuthorizationCancelledError,
  throwIfAuthorizationCancelled,
  isAuthorizationCancelledError,
  isAuthorizationInputRejectedError,
  type AuthorizationAbort,
  type AuthorizationSignal,
} from "./auth-errors";
import {
  clearWidgetRefreshMetadata,
  recordWidgetRefreshSuccess,
} from "./widget-refresh-metadata";
import type { ProviderCore } from "../providers/contracts";

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
  getCopilotAuthorizationState(): CopilotAuthorizationState | null;
  getConsoleAuthorizationRegion?(provider: ProviderId): "intl" | "cn" | null;
  getConsoleAuthorizationUrl?(
    provider: ProviderId,
    region: "intl" | "cn",
  ): string | null;
  /** 无地区概念的密钥平台（如 DeepSeek）恢复授权页时使用。 */
  getProviderAuthorizationUrl?(provider: ProviderId): string | null;
  writeLog(input: AuthCoordinatorLog): void;
};

export type AuthStartResult =
  | { ok: true; sheet: AuthSheet }
  | { ok: false; message: string; sheet?: AuthSheet };

export type AuthCompletion = {
  provider: ProviderId;
  profileId: string;
};

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/**
 * 取消已经生效（会话推进、旧任务已中止），但账号/缓存清理失败。
 * 携带当前会话的引导页，供页面显示原因并“重试取消”，
 * 而不是把失败吞掉或留在恒假的可用按钮上。
 */
export class AuthorizationCancelError extends Error {
  readonly sheet: AuthSheet;

  constructor(sheet: AuthSheet) {
    super(sheet.status);
    this.name = "AuthorizationCancelError";
    this.sheet = sheet;
  }
}

/** Internal markers only; the guide sheet renders its own copy. */
const PENDING_STATUS = "pending";
const PREPARED_STATUS = "prepared";

function regionFor(
  provider: ProviderId,
  providerInput?: string,
): "intl" | "cn" | undefined {
  if (provider !== "zai" && provider !== "minimax" && provider !== "workbuddy")
    return undefined;
  return providerInput === "cn" ? "cn" : "intl";
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
    status: resumed ? PENDING_STATUS : "device_code",
    ...(resumed ? { resumed: true } : {}),
  };
}

export function createAuthCoordinator(
  dependencies: AuthCoordinatorDependencies,
) {
  let startInFlight: Promise<AuthStartResult> | null = null;
  let completeInFlight: Promise<AuthCompletion> | null = null;
  let completeAbort: AuthorizationAbort | null = null;
  let completingAccount: { provider: ProviderId; profileId: string } | null =
    null;
  let sessionId = 0;
  let startingAccount: {
    provider: ProviderId;
    profileId: string;
    previousSessionId: number;
  } | null = null;

  function isCurrent(sheet: AuthSheet): boolean {
    return sheet.sessionId === undefined || sheet.sessionId === sessionId;
  }

  function stamp(sheet: AuthSheet): AuthSheet {
    return { ...sheet, sessionId };
  }

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
      if (state) return stamp(copilotSheet(state, true));
    }
    const authorizationRegion =
      dependencies.getConsoleAuthorizationRegion?.(pending.provider) || null;
    const authorizationUrl = authorizationRegion
      ? dependencies.getConsoleAuthorizationUrl?.(
          pending.provider,
          authorizationRegion,
        ) || undefined
      : dependencies.getProviderAuthorizationUrl?.(pending.provider) ||
        undefined;
    return stamp({
      provider: pending.provider,
      profileId: pending.profileId,
      authorizationInput: "",
      status: PENDING_STATUS,
      authorizationRegion: authorizationRegion || undefined,
      authorizationUrl,
      resumed: true,
    });
  }

  function preparedSheet(
    provider: ProviderId,
    accountId: string,
    url: string,
    providerInput?: string,
  ): AuthSheet {
    return {
      provider,
      profileId: accountId,
      authorizationInput: "",
      authorizationUrl: url,
      status: PREPARED_STATUS,
      authorizationRegion: regionFor(provider, providerInput),
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
    if (existing) return { ok: true, sheet: existing };

    const attemptSession = ++sessionId;
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
      startingAccount = {
        provider: options.provider,
        profileId: account.id,
        previousSessionId: attemptSession - 1,
      };
      retireAccountWork(options.provider, account.id);
      const url = await api.auth.start(account.id, options.providerInput);
      if (attemptSession !== sessionId) {
        api.auth.clearPending();
        throw new AuthorizationCancelledError();
      }
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
              sessionId: attemptSession,
              provider: options.provider,
              profileId: account.id,
              authorizationInput: "",
              authorizationUrl: url,
              status: "设备码读取失败，请取消后重新开始",
            },
          };
        }
        return {
          ok: true,
          sheet: stamp(copilotSheet(state, false)),
        };
      }

      return {
        ok: true,
        sheet: stamp(
          preparedSheet(
            options.provider,
            account.id,
            url,
            options.providerInput,
          ),
        ),
      };
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
        if (startInFlight === running) {
          startInFlight = null;
          startingAccount = null;
        }
      },
      () => {
        if (startInFlight === running) {
          startInFlight = null;
          startingAccount = null;
        }
      },
    );
    return running;
  }

  async function performComplete(
    sheet: AuthSheet,
    signal: AuthorizationSignal,
  ): Promise<AuthCompletion> {
    if (dependencies.isDemoMode()) throw new Error("演示模式不会完成真实授权");
    try {
      await dependencies
        .getProvider(sheet.provider)
        .auth.complete(sheet.authorizationInput, signal);
      throwIfAuthorizationCancelled(signal);
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
      if (signal.aborted) throw new AuthorizationCancelledError();
      if (
        isAuthorizationCancelledError(error) ||
        error instanceof AuthorizationCheckDeferred ||
        isAuthorizationInputRejectedError(error)
      )
        throw error;
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
    if (!isCurrent(sheet))
      return Promise.reject(new AuthorizationCancelledError());
    if (completeInFlight) {
      return completingAccount?.provider === sheet.provider &&
        completingAccount.profileId === sheet.profileId
        ? completeInFlight
        : Promise.reject(new Error("其他账号正在完成授权"));
    }
    const pendingId = dependencies.getProvider(sheet.provider).auth.pendingId();
    if (pendingId !== sheet.profileId)
      return Promise.reject(new Error("未找到匹配的待完成授权，请重新授权"));
    completingAccount = {
      provider: sheet.provider,
      profileId: sheet.profileId,
    };
    const abort = createAuthorizationAbort();
    completeAbort = abort;
    const running = performComplete(sheet, abort).finally(() => {
      if (completeInFlight === running) {
        completeInFlight = null;
        completingAccount = null;
      }
      if (completeAbort === abort) completeAbort = null;
    });
    completeInFlight = running;
    return running;
  }

  function cancel(sheet: AuthSheet): void {
    const cancellingStart =
      startingAccount?.provider === sheet.provider &&
      startingAccount.profileId === sheet.profileId &&
      startingAccount.previousSessionId === sheet.sessionId;
    if (!isCurrent(sheet) && !cancellingStart) return;
    // 会话推进与旧任务中止保持现有顺序且不可回滚；清理失败只能通过错误 sheet 暴露。
    sessionId += 1;
    retireAccountWork(sheet.provider, sheet.profileId);
    const abort = completeAbort;
    completeAbort = null;
    completeInFlight = null;
    completingAccount = null;
    abort?.abort();
    try {
      const api = dependencies.getProvider(sheet.provider);
      if (api.auth.pendingId() === sheet.profileId) api.auth.clearPending();
      if (api.token(sheet.profileId)) return;
      const removed = api.remove(sheet.profileId);
      if (!removed.ok && removed.reason !== "account_not_found") throw new Error("未授权账号清理失败");
      api.usage.clearCache(sheet.profileId);
      clearWidgetRefreshMetadata(sheet.provider, sheet.profileId);
      api.clearSettings(sheet.profileId);
    } catch (error) {
      throw new AuthorizationCancelError(
        stamp({
          ...sheet,
          authorizationInput: "",
          authorizationUrl: undefined,
          deviceCode: undefined,
          resumed: false,
          status: `取消授权失败：${errorText(error)}`,
        }),
      );
    }
  }

  function restart(
    sheet: AuthSheet,
    providerInput?: string,
  ): Promise<AuthStartResult> {
    if (!isCurrent(sheet) || startInFlight || completeInFlight) {
      return Promise.resolve({
        ok: false,
        message: "授权会话已变化或仍在处理中，请稍后重试",
      });
    }
    const pending = findPending();
    if (
      pending &&
      (pending.provider !== sheet.provider ||
        pending.profileId !== sheet.profileId)
    ) {
      return Promise.resolve({
        ok: false,
        message: "存在其他未完成授权，请先处理",
      });
    }
    dependencies.getProvider(sheet.provider).auth.clearPending();
    return start({
      provider: sheet.provider,
      profileId: sheet.profileId,
      providerInput,
    }).then((result) => {
      if (
        !result.ok &&
        !result.sheet &&
        dependencies
          .getProvider(sheet.provider)
          .list()
          .some((account) => account.id === sheet.profileId)
      ) {
        return {
          ...result,
          sheet: stamp({
            ...sheet,
            authorizationInput: "",
            authorizationUrl: undefined,
            deviceCode: undefined,
            status: `授权失败：${result.message}`,
          }),
        };
      }
      return result;
    });
  }

  return { findPending, resume, start, complete, cancel, restart, isCurrent };
}

export type AuthCoordinator = ReturnType<typeof createAuthCoordinator>;
