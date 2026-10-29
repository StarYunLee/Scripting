import {
  AuthorizationCancelledError,
  AuthorizationInputRejectedError,
  createAuthorizationGuard,
  isAuthorizationCancelledError,
  throwIfAuthorizationCancelled,
  type AuthorizationSignal,
} from "../../services/auth-errors";
import { AuthorizationCheckDeferred } from "../../services/auth-single-check";
import { CredentialPersistenceError } from "../../services/credential-errors";
import { activePendingAuthorization } from "../../services/oauth-pending";
import { listAccounts, saveProfileCredentials } from "./accounts";
import {
  clearUsageCache,
  normalizeDeepseekApiKey,
  verifyDeepseekApiKey,
} from "./api";

export const DEEPSEEK_CONSOLE_URL = "https://platform.deepseek.com/api_keys";
export const DEEPSEEK_PENDING_STORAGE_KEY =
  "ai_usage_deepseek_oauth_pending_v1";

const PENDING_TTL_MS = 15 * 60_000;

type PendingAuth = {
  createdAt: number;
  profileId: string;
  authorizationUrl: string;
};

function savePending(value: PendingAuth): void {
  if (!Keychain.set(DEEPSEEK_PENDING_STORAGE_KEY, JSON.stringify(value)))
    throw new Error("无法保存临时授权状态");
}

function readPending(): PendingAuth | null {
  try {
    const raw = Keychain.get(DEEPSEEK_PENDING_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingAuth>;
    if (
      typeof value.createdAt !== "number" ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt <= 0 ||
      typeof value.profileId !== "string" ||
      !value.profileId
    )
      return null;
    return {
      createdAt: value.createdAt,
      profileId: value.profileId,
      authorizationUrl:
        typeof value.authorizationUrl === "string" && value.authorizationUrl
          ? value.authorizationUrl
          : DEEPSEEK_CONSOLE_URL,
    };
  } catch {
    return null;
  }
}

function clearPending(): void {
  try {
    Keychain.remove(DEEPSEEK_PENDING_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 只清仍属于本次流程的 pending，绝不删除更晚发起的新授权。 */
function clearPendingIfCurrent(pending: PendingAuth): void {
  const current = readPending();
  if (!current) return;
  if (JSON.stringify(current) === JSON.stringify(pending)) clearPending();
}

/** 账号存在性按 id 严格判断，避免同名账号让已删除的 pending 复活。 */
function accountExists(profileId: string): boolean {
  try {
    return listAccounts().some((account) => account.id === profileId);
  } catch {
    // 注册表暂时不可读时保守视为存在：宁可保留 pending，也不误清授权。
    return true;
  }
}

/** pending 有效且账号仍存在；已删除账号的残留 pending 就地清理。 */
function activePending(): PendingAuth | null {
  const pending = activePendingAuthorization(
    readPending(),
    PENDING_TTL_MS,
    clearPending,
  );
  if (!pending) return null;
  if (accountExists(pending.profileId)) return pending;
  clearPendingIfCurrent(pending);
  return null;
}

/** 暂时性校验失败：保留本次 pending，允许用户稍后原地重试。 */
function isRetryableVerifyFailure(verified: {
  code: string;
  status?: number;
}): boolean {
  if (
    verified.code === "network_error" ||
    verified.code === "rate_limited" ||
    verified.code === "invalid_response"
  )
    return true;
  if (verified.code === "http_error") {
    const status = verified.status;
    return status === 408 || (typeof status === "number" && status >= 500);
  }
  return false;
}

export function hasPendingAuth(): boolean {
  return Boolean(activePending());
}

export function getPendingAuthProfileId(): string | null {
  return activePending()?.profileId || null;
}

export function getPendingAuthorizationUrl(): string | null {
  return activePending()?.authorizationUrl || null;
}

export function clearPendingAuth(): void {
  clearPending();
}

/**
 * API Key 授权：创建待验证状态，直接在应用内粘贴 Key。
 * 返回的控制台地址仅供“获取 API Key”按钮按需使用，不自动打开。
 * 没有公开 OAuth / userToken / 第三方网关，不发起任何聊天请求。
 */
export async function startDeepseekLogin(
  profileId: string,
  _input?: string,
): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  if (!accountExists(profileId)) throw new Error("未找到要授权的账号");
  savePending({
    createdAt: Date.now(),
    profileId,
    authorizationUrl: DEEPSEEK_CONSOLE_URL,
  });
  return DEEPSEEK_CONSOLE_URL;
}

export async function completeDeepseekLogin(
  input?: string,
  signal?: AuthorizationSignal,
): Promise<void> {
  throwIfAuthorizationCancelled(signal);
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 DeepSeek 授权，请重新开始");
  const assertCurrent = createAuthorizationGuard(pending, readPending, signal);

  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPendingIfCurrent(pending);
    throw new Error("授权会话已超过 15 分钟，请重新开始");
  }
  // 账号在等待授权期间被删除：明确取消并清掉残留 pending，避免误报 Keychain。
  if (!accountExists(pending.profileId)) {
    clearPendingIfCurrent(pending);
    throw new AuthorizationCancelledError(
      "待授权的 DeepSeek 账号已被删除，请重新开始",
    );
  }
  if (!input || !input.trim())
    throw new AuthorizationInputRejectedError("请粘贴 DeepSeek API Key");
  const apiKey = normalizeDeepseekApiKey(input);
  if (!apiKey)
    throw new AuthorizationInputRejectedError(
      "请粘贴完整的 DeepSeek API Key",
    );

  /** 每次 await 之后、写盘之前都必须确认会话与账号仍然有效。 */
  const assertActive = (): void => {
    assertCurrent();
    if (!accountExists(pending.profileId))
      throw new AuthorizationCancelledError(
        "待授权的 DeepSeek 账号已被删除，请重新开始",
      );
  };

  try {
    const verified = await verifyDeepseekApiKey(apiKey);
    assertActive();
    if (!verified.ok) {
      // 误贴/401 保留 pending，让用户直接重新粘贴。
      if (verified.code === "unauthorized")
        throw new AuthorizationInputRejectedError(
          "DeepSeek API Key 无效或已过期，请重新复制",
        );
      // 暂时性失败（网络/超时/5xx/408/429/响应不完整）保留 pending 供原地重试。
      if (isRetryableVerifyFailure(verified))
        throw new AuthorizationCheckDeferred(
          verified.message || "暂时无法确认 DeepSeek 授权，请稍后重试",
        );
      // 其余为确定终态失败：清理本次 pending 后报错。
      throw new Error(verified.message || "DeepSeek 余额查询失败");
    }

    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: apiKey,
    });
    if (!saved) {
      // 保存失败若因账号消失，应明确取消，而不是归因 Keychain。
      if (!accountExists(pending.profileId)) {
        clearPendingIfCurrent(pending);
        throw new AuthorizationCancelledError(
          "待授权的 DeepSeek 账号已被删除，未保存该 Key",
        );
      }
      throw new CredentialPersistenceError(
        "API Key 已验证，但本机 Keychain 保存失败",
      );
    }
    assertActive();
    // 换 Key 后旧余额不再代表该账号，清掉缓存避免串数据。
    clearUsageCache(pending.profileId);
    clearPendingIfCurrent(pending);
  } catch (error) {
    // 取消或已有新 pending 时抛出取消错误，且不清理新 pending。
    assertCurrent();
    if (!accountExists(pending.profileId)) {
      clearPendingIfCurrent(pending);
      throw new AuthorizationCancelledError(
        "待授权的 DeepSeek 账号已被删除，请重新开始",
      );
    }
    // 可重试/可重新粘贴的错误保留本次 pending；其余终态清本次 pending。
    if (
      isAuthorizationCancelledError(error) ||
      error instanceof AuthorizationCheckDeferred ||
      error instanceof AuthorizationInputRejectedError
    )
      throw error;
    clearPendingIfCurrent(pending);
    throw error;
  }
}
