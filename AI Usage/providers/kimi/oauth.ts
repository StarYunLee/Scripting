import { fetch, Response } from "scripting";
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
const POLL_MAX_ATTEMPTS = 180;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return asObject(JSON.parse(text)) || {};
  } catch {
    throw new Error(`OAuth 响应异常（HTTP ${response.status}）`);
  }
}

function trustedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function kimiRequestHeaders(token?: string | null): Record<string, string> {
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
  const pending = readPending();
  return Boolean(pending && Date.now() - pending.createdAt <= PENDING_TTL_MS);
}

export function getPendingOAuthProfileId(): string | null {
  const pending = readPending();
  return pending && Date.now() - pending.createdAt <= PENDING_TTL_MS
    ? pending.profileId
    : null;
}

export function clearPendingOAuth(): void {
  clearPending();
}

export async function startKimiLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const body = new URLSearchParams({ client_id: CLIENT_ID }).toString();
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
  const verificationUriComplete = trustedHttpUrl(data.verification_uri_complete);
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

async function pollForToken(pending: PendingOAuth): Promise<TokenPayload> {
  let intervalMs = pending.intervalMs;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(intervalMs);
    if (Date.now() - pending.createdAt > PENDING_TTL_MS)
      throw new Error("Kimi 授权会话已超时，请重新开始");
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      device_code: pending.deviceCode,
      grant_type: DEVICE_GRANT,
    }).toString();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      timeout: 20,
      debugLabel: "KimiTokenPoll",
    });
    const data = (await jsonObject(response)) as TokenPayload;
    if (response.ok && data.access_token && data.refresh_token) return data;
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      const next =
        typeof data.interval === "number" && data.interval > 0
          ? data.interval * 1000
          : intervalMs + 1000;
      intervalMs = Math.max(intervalMs, next);
      continue;
    }
    if (data.error === "expired_token")
      throw new Error("Kimi 设备授权码已过期，请重新开始");
    if (data.error === "access_denied") throw new Error("Kimi 登录被拒绝");
    if (response.status >= 500) continue;
    throw new Error(
      data.error_description ||
        data.error ||
        `Kimi Token 轮询失败（HTTP ${response.status}）`,
    );
  }
  throw new Error("等待 Kimi 授权超时，请确认已在浏览器完成登录后重试");
}

async function fetchIdentity(
  token: string,
): Promise<{ email: string | null; accountId: string | null; name: string | null }> {
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
      typeof data.email === "string" && data.email.includes("@") ? data.email : null;
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

export async function completeKimiLogin(_input?: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Kimi 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 15 分钟，请重新授权");
  }
  try {
    const tokens = await pollForToken(pending);
    const identity = await fetchIdentity(tokens.access_token!);
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
    clearPending();
    throw error;
  }
}

export async function refreshOAuthToken(
  profileId: string,
  force = false,
): Promise<string | null> {
  const current = getProfileAccessToken(profileId);
  const expiresAt = getProfileTokenExpiresAt(profileId);
  if (!force && current && (!expiresAt || expiresAt > Date.now() + 2 * 60_000))
    return current;
  const refreshToken = getProfileRefreshToken(profileId);
  if (!refreshToken) return current;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();
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
  saveProfileCredentials(profileId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt:
      Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    accountId: identity.accountId,
    email: identity.email,
    name: identity.name,
  });
  return data.access_token;
}
