import {
  AuthorizationCheckDeferred,
  checkAuthorizationOnce,
} from "../../services/auth-single-check";
import { captureAccountWork } from "../../services/account-work-guard";
import { createAccountOperationFlight } from "../../services/runtime-consistency";
import { activePendingAuthorization } from "../../services/oauth-pending";
import { CredentialPersistenceError } from "../../services/credential-errors";
import {
  createAuthorizationGuard,
  throwIfAuthorizationCancelled,
  type AuthorizationSignal,
} from "../../services/auth-errors";

import { fetch, Response } from "scripting";
import { formEncode } from "../../services/form-encoding";
import {
  getProfileAccessToken,
  getProfileRefreshToken,
  getProfileTokenExpiresAt,
  getStableDeviceId,
  saveProfileCredentials,
} from "./accounts";

const CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
const OAUTH_HOST = "https://auth.kimi.com";
const DEVICE_URL = `${OAUTH_HOST}/api/oauth/device_authorization`;
const TOKEN_URL = `${OAUTH_HOST}/api/oauth/token`;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const PENDING_KEY = "ai_usage_kimi_oauth_pending_v1";
const PENDING_TTL_MS = 15 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

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
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  interval?: number;
};

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
  if (!/^https?:\/\//i.test(normalized)) return null;
  return normalized;
}

export function kimiRequestHeaders(
  token?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "AI-Usage-Scripting/1.3.0",
    "X-Msh-Platform": "scripting",
    "X-Msh-Version": "1.3.0",
    "X-Msh-Device-Name": "AI Usage",
    "X-Msh-Device-Model": "iOS",
    "X-Msh-Os-Version": "iOS",
    "X-Msh-Device-Id": getStableDeviceId(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
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

export async function startKimiLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const body = formEncode({ client_id: CLIENT_ID });
  const response = await fetch(DEVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    timeout: 20,
    debugLabel: "KimiDeviceAuth",
  });
  const data = await jsonObject(response);
  if (!response.ok)
    throw new Error(
      typeof data.error_description === "string"
        ? data.error_description
        : `Kimi 设备授权失败（HTTP ${response.status}）`,
    );
  const deviceCode = data.device_code;
  const userCode = data.user_code;
  const verificationUriComplete = trustedHttpUrl(
    data.verification_uri_complete,
  );
  const verificationUri = trustedHttpUrl(data.verification_uri);
  if (
    typeof deviceCode !== "string" ||
    typeof userCode !== "string" ||
    !verificationUriComplete
  )
    throw new Error("Kimi 设备授权响应字段不完整");
  const intervalSeconds =
    typeof data.interval === "number" && data.interval > 0
      ? data.interval
      : DEFAULT_POLL_INTERVAL_MS / 1000;
  savePending({
    deviceCode,
    userCode,
    verificationUri: verificationUri || verificationUriComplete,
    intervalMs: Math.max(2, intervalSeconds) * 1000,
    createdAt: Date.now(),
    profileId,
  });
  return verificationUriComplete;
}

let lastCheck: { deviceCode: string; nextAt: number; interval: number } | null =
  null;
async function pollForToken(
  pending: PendingOAuth,
  signal?: AuthorizationSignal,
): Promise<TokenPayload> {
  if (Date.now() - pending.createdAt > PENDING_TTL_MS)
    throw new Error("Kimi 授权会话已过期，请重新授权");
  if (!lastCheck || lastCheck.deviceCode !== pending.deviceCode)
    lastCheck = {
      deviceCode: pending.deviceCode,
      nextAt: pending.createdAt + pending.intervalMs,
      interval: pending.intervalMs,
    };
  const check = lastCheck;
  if (Date.now() < check.nextAt)
    throw new AuthorizationCheckDeferred(
      "尚未到允许的检查时间，请稍后继续授权",
    );
  check.nextAt = Date.now() + check.interval;
  return checkAuthorizationOnce(async (checkSignal) => {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formEncode({
        client_id: CLIENT_ID,
        device_code: pending.deviceCode,
        grant_type: DEVICE_GRANT,
      }),
      timeout: 5,
      debugLabel: "KimiTokenPoll",
    });
    throwIfAuthorizationCancelled(checkSignal);
    const data = (await jsonObject(response)) as TokenPayload;
    throwIfAuthorizationCancelled(checkSignal);
    if (response.ok && data.access_token && data.refresh_token) return data;
    if (data.error === "slow_down") {
      check.interval = Math.max(
        check.interval + 5000,
        typeof data.interval === "number" ? data.interval * 1000 : 0,
      );
      check.nextAt = Date.now() + check.interval;
      throw new AuthorizationCheckDeferred("检查间隔已延长，请稍后继续授权");
    }
    if (data.error === "authorization_pending")
      throw new AuthorizationCheckDeferred();
    if (data.error === "expired_token" || data.error === "access_denied")
      throw new Error("Kimi 授权已过期或被拒绝，请重新授权");
    throw new AuthorizationCheckDeferred(
      "暂时无法确认授权结果，请稍后继续授权",
    );
  }, signal).catch((error) => {
    if (
      error instanceof AuthorizationCheckDeferred ||
      (error instanceof Error &&
        (error.name === "AuthorizationCancelledError" ||
          error.message.includes("被拒绝")))
    )
      throw error;
    throw new AuthorizationCheckDeferred(
      "暂时无法确认授权结果，请稍后继续授权",
    );
  });
}

async function fetchIdentity(token: string): Promise<{
  email: string | null;
  accountId: string | null;
  name: string | null;
}> {
  try {
    const response = await fetch("https://api.kimi.com/coding/v1/me", {
      method: "GET",
      headers: kimiRequestHeaders(token),
      timeout: 15,
      debugLabel: "KimiUserInfo",
    });
    if (!response.ok) return { email: null, accountId: null, name: null };
    const data = await jsonObject(response);
    const email =
      typeof data.email === "string" && data.email.includes("@")
        ? data.email
        : null;
    const accountId =
      typeof data.user_id === "string"
        ? data.user_id
        : typeof data.id === "string"
          ? data.id
          : null;
    const name =
      typeof data.nickname === "string" && data.nickname.trim()
        ? data.nickname.trim()
        : null;
    return { email, accountId, name };
  } catch {
    return { email: null, accountId: null, name: null };
  }
}

export async function completeKimiLogin(
  _input?: string,
  signal?: AuthorizationSignal,
): Promise<void> {
  throwIfAuthorizationCancelled(signal);
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Kimi 授权，请重新开始");
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
      refreshToken: tokens.refresh_token,
      expiresAt:
        Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000,
      accountId: identity.accountId,
      email: identity.email,
      name: identity.name,
    });
    if (!saved) throw new Error("Token 已获取，但本机 Keychain 保存失败");
    clearPending();
  } catch (error) {
    assertCurrent();
    if (error instanceof AuthorizationCheckDeferred) throw error;
    clearPending();
    throw error;
  }
}

const renewAccount = createAccountOperationFlight<{
  token: string | null;
  forced: boolean;
}>();
export async function refreshOAuthToken(
  profileId: string,
  force = false,
): Promise<string | null> {
  const before = getProfileAccessToken(profileId);
  const execute = () =>
    renewAccount(profileId, async () => ({
      token: await performTokenRefresh(profileId, force),
      forced: force,
    }));
  const result = await execute();
  return force && !result.forced && result.token === before
    ? (await execute()).token
    : result.token;
}
async function performTokenRefresh(
  profileId: string,
  force = false,
): Promise<string | null> {
  const currentWork = captureAccountWork("kimi", profileId);
  const current = getProfileAccessToken(profileId);
  const expiresAt = getProfileTokenExpiresAt(profileId);
  if (!force && current && (!expiresAt || expiresAt > Date.now() + 2 * 60_000))
    return current;
  const refreshToken = getProfileRefreshToken(profileId);
  if (!refreshToken) return current;
  const body = formEncode({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    timeout: 20,
    debugLabel: "KimiTokenRefresh",
  });
  const data = (await jsonObject(response)) as TokenPayload;
  if (!response.ok || !data.access_token) return current;
  const identity = await fetchIdentity(data.access_token);
  if (
    !currentWork() ||
    getProfileAccessToken(profileId) !== current ||
    getProfileRefreshToken(profileId) !== refreshToken
  )
    return getProfileAccessToken(profileId);
  const saved = saveProfileCredentials(profileId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt:
      Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    accountId: identity.accountId,
    email: identity.email,
    name: identity.name,
  });
  if (!saved) throw new CredentialPersistenceError();
  return data.access_token;
}
