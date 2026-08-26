import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  saveProfileCredentials,
} from "./accounts";

/** VS Code Copilot OAuth App（公开 client_id，copilot-api 等同源） */
const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_API = "https://api.github.com";
const GITHUB_HOST = "https://github.com";
const DEVICE_URL = `${GITHUB_HOST}/login/device/code`;
const TOKEN_URL = `${GITHUB_HOST}/login/oauth/access_token`;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SCOPES = "read:user";
const PENDING_KEY = "ai_usage_copilot_oauth_pending_v1";
const PENDING_TTL_MS = 15 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const POLL_MAX_ATTEMPTS = 180;
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

export function copilotRequestHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": `GitHubCopilotChat/${COPILOT_VERSION}`,
    "Editor-Version": "vscode/1.96.0",
    "Editor-Plugin-Version": `copilot-chat/${COPILOT_VERSION}`,
    "X-GitHub-Api-Version": "2025-04-01",
  };
  if (token) headers.Authorization = `token ${token}`;
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

async function pollForToken(pending: PendingOAuth): Promise<TokenPayload> {
  let intervalMs = pending.intervalMs;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(intervalMs);
    if (Date.now() - pending.createdAt > PENDING_TTL_MS)
      throw new Error("GitHub 授权会话已超时，请重新开始");
    const response = await fetch(TOKEN_URL, {
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
      timeout: 20,
      debugLabel: "CopilotTokenPoll",
    });
    const data = (await jsonObject(response)) as TokenPayload;
    if (response.ok && data.access_token) return data;
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      intervalMs = Math.min(intervalMs + 1000, 15_000);
      continue;
    }
    if (data.error === "expired_token")
      throw new Error("GitHub 设备授权码已过期，请重新开始");
    if (data.error === "access_denied") throw new Error("GitHub 登录被拒绝");
    if (response.status >= 500) continue;
    throw new Error(
      data.error_description ||
        data.error ||
        `GitHub Token 轮询失败（HTTP ${response.status}）`,
    );
  }
  throw new Error("等待 GitHub 授权超时，请确认已在浏览器完成登录后重试");
}

async function fetchIdentity(
  token: string,
): Promise<{ email: string | null; accountId: string | null; name: string | null }> {
  try {
    const response = await fetch(`${GITHUB_API}/user`, {
      method: "GET",
      headers: copilotRequestHeaders(token),
      timeout: 15,
      debugLabel: "CopilotUserInfo",
    });
    if (!response.ok) return { email: null, accountId: null, name: null };
    const data = await jsonObject(response);
    const email =
      typeof data.email === "string" && data.email.includes("@") ? data.email : null;
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
    return { email, accountId, name };
  } catch {
    return { email: null, accountId: null, name: null };
  }
}

export async function completeCopilotLogin(_input?: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 GitHub 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 15 分钟，请重新授权");
  }
  try {
    const tokens = await pollForToken(pending);
    const identity = await fetchIdentity(tokens.access_token!);
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.access_token!,
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

/** GitHub OAuth token 长期有效，无需 refresh。 */
export async function refreshOAuthToken(
  profileId: string,
  _force = false,
): Promise<string | null> {
  return getProfileAccessToken(profileId);
}

export function getPendingUserCode(): string | null {
  const pending = readPending();
  if (!pending || Date.now() - pending.createdAt > PENDING_TTL_MS) return null;
  return pending.userCode;
}
