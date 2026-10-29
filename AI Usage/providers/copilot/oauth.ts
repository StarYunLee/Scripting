import { activePendingAuthorization } from "../../services/oauth-pending";
import {
  createAuthorizationGuard,
  isAuthorizationCancelledError,
  throwIfAuthorizationCancelled,
  waitForAuthorization,
  type AuthorizationSignal,
} from "../../services/auth-errors";
import {
  AuthorizationCheckDeferred,
  checkAuthorizationOnce,
} from "../../services/auth-single-check";
import { fetch, Response } from "scripting";

import {
  getProfileAccessToken,
  resolveProfile,
  saveProfileCredentials,
  updateProfileIdentity,
} from "./accounts";

/** VS Code Copilot OAuth App（公开 client_id，copilot-api 等同源） */
const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_API = "https://api.github.com";
const GITHUB_HOST = "https://github.com";
const DEVICE_URL = `${GITHUB_HOST}/login/device/code`;
const TOKEN_URL = `${GITHUB_HOST}/login/oauth/access_token`;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SCOPES = "read:user user:email";
const PENDING_KEY = "ai_usage_copilot_oauth_pending_v1";
const PENDING_TTL_MS = 15 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
/**
 * 单次「检查授权结果」的时间预算：只覆盖等待网页端完成 GitHub 登录的 token 轮询阶段。
 * 预算内确认到就返回 token，到点仍未确认就抛 AuthorizationCheckDeferred 并保留 pending，
 * 授权页因此不会被一次检查卡住。读取身份不在这个预算内，只受当前授权会话 guard 约束。
 */
const CHECK_BUDGET_MS = 10_000;
/** GitHub 设备流协议：收到 slow_down 后轮询间隔至少再加 5 秒。 */
const SLOW_DOWN_STEP_MS = 5_000;
const DEFERRED_MESSAGE = "暂时无法确认授权结果，请稍后继续授权";
const INTERVAL_MESSAGE = "尚未到下次允许的检查时间，请稍后继续授权";
const COPILOT_VERSION = "0.26.7";

type PendingOAuth = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalMs: number;
  createdAt: number;
  profileId: string;
};

type TokenPayload = {
  access_token?: string;
  error?: string;
  error_description?: string;
  interval?: number;
};

/**
 * 同一次设备授权的轮询节奏，跨多次「检查授权结果」保留，
 * 保证不会早于协议间隔（含 slow_down 之后的新间隔）发请求。
 * 只在进程内记忆；重启后重新使用服务端返回的初始 interval，不修改 pending 格式。
 */
type PollSchedule = {
  deviceCode: string;
  nextAt: number;
  intervalMs: number;
};

let pollSchedule: PollSchedule | null = null;

function resetPollSchedule(): void {
  pollSchedule = null;
}

function scheduleFor(pending: PendingOAuth): PollSchedule {
  if (!pollSchedule || pollSchedule.deviceCode !== pending.deviceCode) {
    pollSchedule = {
      deviceCode: pending.deviceCode,
      nextAt: pending.createdAt + pending.intervalMs,
      intervalMs: pending.intervalMs,
    };
  }
  return pollSchedule;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function savePending(value: PendingOAuth): void {
  if (!Keychain.set(PENDING_KEY, JSON.stringify(value)))
    throw new Error("无法保存临时 OAuth 状态");
}

function readPending(): PendingOAuth | null {
  try {
    const raw = Keychain.get(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingOAuth>;
    if (
      !value.deviceCode ||
      !value.userCode ||
      !value.verificationUri ||
      !value.createdAt ||
      !value.profileId
    )
      return null;
    return {
      deviceCode: value.deviceCode,
      userCode: value.userCode,
      verificationUri: value.verificationUri,
      intervalMs:
        typeof value.intervalMs === "number" && value.intervalMs > 0
          ? value.intervalMs
          : DEFAULT_POLL_INTERVAL_MS,
      createdAt: value.createdAt,
      profileId: value.profileId,
    };
  } catch {
    return null;
  }
}

function clearPending(): void {
  resetPollSchedule();
  try {
    Keychain.remove(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

async function jsonObject(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return asObject(JSON.parse(text)) || {};
  } catch {
    throw new Error(`OAuth 响应异常（HTTP ${response.status}）`);
  }
}

function trustedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  return /^https?:\/\//i.test(normalized) ? normalized : null;
}

export function copilotRequestHeaders(
  token?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": `GitHubCopilotChat/${COPILOT_VERSION}`,
    "Editor-Version": "vscode/1.96.0",
    "Editor-Plugin-Version": `copilot-chat/${COPILOT_VERSION}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

export function hasPendingOAuth(): boolean {
  return Boolean(
    activePendingAuthorization(readPending(), PENDING_TTL_MS, clearPending),
  );
}

export function getPendingOAuthProfileId(): string | null {
  return (
    activePendingAuthorization(readPending(), PENDING_TTL_MS, clearPending)
      ?.profileId || null
  );
}

export function clearPendingOAuth(): void {
  clearPending();
}

export async function startCopilotLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const response = await fetch(DEVICE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
    timeout: 20,
    debugLabel: "CopilotDeviceAuth",
  });
  const data = await jsonObject(response);
  if (!response.ok)
    throw new Error(
      typeof data.error_description === "string"
        ? data.error_description
        : `GitHub 设备授权失败（HTTP ${response.status}）`,
    );
  const deviceCode = data.device_code;
  const userCode = data.user_code;
  const verificationUri = trustedHttpUrl(data.verification_uri);
  if (
    typeof deviceCode !== "string" ||
    typeof userCode !== "string" ||
    !verificationUri
  )
    throw new Error("GitHub 设备授权响应字段不完整");
  const intervalSeconds =
    typeof data.interval === "number" && data.interval > 0
      ? data.interval
      : DEFAULT_POLL_INTERVAL_MS / 1000;
  savePending({
    deviceCode,
    userCode,
    verificationUri,
    intervalMs: Math.max(2, intervalSeconds) * 1000,
    createdAt: Date.now(),
    profileId,
  });
  return verificationUri;
}

type TokenPollOutcome =
  | { kind: "token"; accessToken: string }
  | { kind: "pending" }
  | { kind: "slow_down"; intervalMs: number | null }
  | { kind: "retryable"; message: string }
  | { kind: "terminal"; message: string };

/**
 * 单次设备流 token 请求，只做分类不做重试：
 * - 明确终态（expired_token / access_denied / 成功响应缺 token / 其它协议错误）→ terminal
 * - 可继续检查（网络异常、响应读不出、非 JSON、408/429/5xx）→ retryable
 * - 协议内的继续等待（authorization_pending / slow_down）→ 对应分支
 */
async function requestDeviceToken(
  pending: PendingOAuth,
  remainingMs: number,
): Promise<TokenPollOutcome> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: pending.deviceCode,
        grant_type: DEVICE_GRANT,
      }),
      // 请求自身也不允许把等待拖出本次检查的剩余预算。
      timeout: Math.max(1, Math.ceil(remainingMs / 1000)),
      debugLabel: "CopilotTokenPoll",
    });
  } catch {
    return { kind: "retryable", message: DEFERRED_MESSAGE };
  }
  let payload: Record<string, unknown> | null;
  try {
    payload = asObject(JSON.parse(await response.text()));
  } catch {
    payload = null;
  }
  if (!payload)
    return {
      kind: "retryable",
      message: `GitHub Token 响应异常（HTTP ${response.status}），请稍后继续授权`,
    };
  const error = typeof payload.error === "string" ? payload.error : null;
  if (
    response.ok &&
    typeof payload.access_token === "string" &&
    payload.access_token
  )
    return { kind: "token", accessToken: payload.access_token };
  if (error === "authorization_pending") return { kind: "pending" };
  if (error === "slow_down")
    return {
      kind: "slow_down",
      intervalMs:
        typeof payload.interval === "number" && payload.interval > 0
          ? payload.interval * 1000
          : null,
    };
  if (error === "expired_token")
    return { kind: "terminal", message: "GitHub 设备授权码已过期，请重新开始" };
  if (error === "access_denied")
    return { kind: "terminal", message: "GitHub 登录被拒绝" };
  if (
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500
  )
    return { kind: "retryable", message: DEFERRED_MESSAGE };
  if (response.ok)
    return { kind: "terminal", message: "GitHub Token 响应缺少 access_token" };
  const description =
    typeof payload.error_description === "string"
      ? payload.error_description
      : error;
  return {
    kind: "terminal",
    message: description || `GitHub Token 轮询失败（HTTP ${response.status}）`,
  };
}

/**
 * 预算内的设备流检查：等待与请求都不会越过 deadline，到点即 Deferred。
 * 发请求前先按 schedule 对齐协议间隔（含 slow_down 抬高的间隔）。
 */
async function checkDeviceToken(
  pending: PendingOAuth,
  schedule: PollSchedule,
  deadline: number,
  checkSignal: AuthorizationSignal,
): Promise<TokenPayload> {
  for (;;) {
    const now = Date.now();
    if (now - pending.createdAt > PENDING_TTL_MS)
      throw new Error("GitHub 授权会话已超时，请重新开始");
    if (now >= deadline)
      throw new AuthorizationCheckDeferred(DEFERRED_MESSAGE);
    // 下一次允许的检查时间落在预算之外：本次不再等待，也不发请求。
    if (schedule.nextAt >= deadline)
      throw new AuthorizationCheckDeferred(INTERVAL_MESSAGE);
    if (schedule.nextAt > now) {
      await waitForAuthorization(schedule.nextAt - now, checkSignal);
      throwIfAuthorizationCancelled(checkSignal);
      continue;
    }
    schedule.nextAt = now + schedule.intervalMs;
    const outcome = await requestDeviceToken(
      pending,
      Math.max(0, deadline - Date.now()),
    );
    // 预算到点会 abort child，晚回的响应不得被当成结果继续保存凭据。
    throwIfAuthorizationCancelled(checkSignal);
    if (outcome.kind === "token") return { access_token: outcome.accessToken };
    if (outcome.kind === "terminal") throw new Error(outcome.message);
    if (outcome.kind === "retryable")
      throw new AuthorizationCheckDeferred(outcome.message);
    if (outcome.kind === "slow_down") {
      schedule.intervalMs = Math.max(
        schedule.intervalMs + SLOW_DOWN_STEP_MS,
        outcome.intervalMs || 0,
      );
      schedule.nextAt = Date.now() + schedule.intervalMs;
      continue;
    }
    // authorization_pending：按 schedule 节奏继续，超出预算由循环顶部收口。
  }
}

async function pollForToken(
  pending: PendingOAuth,
  signal?: AuthorizationSignal,
): Promise<TokenPayload> {
  if (Date.now() - pending.createdAt > PENDING_TTL_MS)
    throw new Error("GitHub 授权会话已超时，请重新开始");
  const schedule = scheduleFor(pending);
  const deadline = Date.now() + CHECK_BUDGET_MS;
  return checkAuthorizationOnce(
    async (checkSignal) => {
      try {
        return await checkDeviceToken(pending, schedule, deadline, checkSignal);
      } catch (error) {
        // child 只会因父取消或本次预算到期而中止：父未取消时按「待继续」收口，
        // 否则预算到期会被误判成用户取消，连带清掉仍在等待的 pending。
        if (isAuthorizationCancelledError(error) && !signal?.aborted)
          throw new AuthorizationCheckDeferred(DEFERRED_MESSAGE);
        throw error;
      }
    },
    signal,
    CHECK_BUDGET_MS,
  );
}

async function fetchIdentity(token: string): Promise<{
  email: string | null;
  accountId: string | null;
  name: string | null;
}> {
  try {
    const response = await fetch(`${GITHUB_API}/user`, {
      method: "GET",
      headers: copilotRequestHeaders(token),
      timeout: 15,
      debugLabel: "CopilotUserInfo",
    });
    if (!response.ok) return { email: null, accountId: null, name: null };
    const data = await jsonObject(response);
    // /user 的 email 仅在用户公开邮箱时返回；否则需 /user/emails（user:email scope）
    let email =
      typeof data.email === "string" && data.email.includes("@")
        ? data.email
        : null;
    const accountId =
      typeof data.id === "number"
        ? String(data.id)
        : typeof data.login === "string"
          ? data.login
          : null;
    const name =
      typeof data.login === "string" && data.login.trim()
        ? data.login.trim()
        : typeof data.name === "string" && data.name.trim()
          ? data.name.trim()
          : null;
    if (!email) email = await fetchPrimaryEmail(token);
    return { email, accountId, name };
  } catch {
    return { email: null, accountId: null, name: null };
  }
}

/** 读取主邮箱（需要 user:email scope；旧 token 无此 scope 时 404，静默忽略）。 */
async function fetchPrimaryEmail(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API}/user/emails`, {
      method: "GET",
      headers: copilotRequestHeaders(token),
      timeout: 15,
      debugLabel: "CopilotUserEmails",
    });
    if (!response.ok) return null;
    const list = JSON.parse(await response.text());
    if (!Array.isArray(list)) return null;
    type EmailEntry = {
      email?: unknown;
      primary?: unknown;
      verified?: unknown;
    };
    const entries = (list as EmailEntry[]).filter(
      (entry) => typeof entry?.email === "string" && entry.email.includes("@"),
    );
    const primary = entries.find(
      (entry) => entry.primary === true && entry.verified !== false,
    );
    const verified = entries.find((entry) => entry.verified === true);
    const chosen = primary || verified || entries[0];
    return chosen ? (chosen.email as string) : null;
  } catch {
    return null;
  }
}

/** 老账号缺邮箱时回填一次（失败静默，不影响用量查询）。 */
export async function ensureAccountEmail(profileId: string): Promise<void> {
  const profile = resolveProfile(profileId);
  if (!profile || profile.email) return;
  const token = getProfileAccessToken(profile.id);
  if (!token) return;
  const identity = await fetchIdentity(token);
  if (identity.email || identity.accountId || identity.name) {
    updateProfileIdentity(profile.id, identity);
  }
}

export async function completeCopilotLogin(
  _input?: string,
  signal?: AuthorizationSignal,
): Promise<void> {
  throwIfAuthorizationCancelled(signal);
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 GitHub 授权，请重新开始");
  const assertCurrent = createAuthorizationGuard(pending, readPending, signal);
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 15 分钟，请重新授权");
  }
  try {
    const tokens = await pollForToken(pending, signal);
    throwIfAuthorizationCancelled(signal);
    assertCurrent();
    const identity = await fetchIdentity(tokens.access_token!);
    assertCurrent();
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.access_token!,
      accountId: identity.accountId,
      email: identity.email,
      name: identity.name,
    });
    if (!saved) throw new Error("Token 已获取，但本机 Keychain 保存失败");
    clearPending();
  } catch (error) {
    assertCurrent();
    // 只有真正终态才清 pending；Deferred 保留设备授权，供「检查授权结果」继续。
    if (!(error instanceof AuthorizationCheckDeferred)) clearPending();
    throw error;
  }
}

/** GitHub OAuth token 长期有效，无需 refresh。 */
export async function refreshOAuthToken(
  profileId: string,
  _force = false,
): Promise<string | null> {
  return getProfileAccessToken(profileId);
}

export function getPendingAuthorizationState(): {
  profileId: string;
  verificationUri: string;
  userCode: string;
} | null {
  const pending = activePendingAuthorization(
    readPending(),
    PENDING_TTL_MS,
    clearPending,
  );
  if (!pending) return null;
  return {
    profileId: pending.profileId,
    verificationUri: pending.verificationUri,
    userCode: pending.userCode,
  };
}
