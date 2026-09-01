import { activePendingAuthorization } from "../../services/oauth-pending";
import {
  CredentialPersistenceError,
  isCredentialPersistenceError,
} from "../../services/credential-errors";
import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  getProfileRefreshToken,
  getProfileTokenExpiresAt,
  saveProfileCredentials,
} from "./accounts";
import { shouldStopCodeAssistHostLoop } from "./host-failover";
import { parseOAuthCallback, parseProjectInfo } from "./parsing";
import type { AntigravityProjectInfo } from "./types";

const CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";
const CODE_ASSIST_HOSTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
] as const;
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];
const CLIENT_USER_AGENT = "vscode/1.X.X (Antigravity/4.3.0)";
const PENDING_KEY = "ai_usage_antigravity_oauth_pending_v1";
const PENDING_TTL_MS = 10 * 60_000;

type PendingOAuth = {
  state: string;
  createdAt: number;
  profileId: string;
};

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: unknown;
  error_description?: unknown;
};

type OAuthError = Error & { status?: number };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function oauthError(message: string, status?: number): OAuthError {
  const error = new Error(message) as OAuthError;
  error.status = status;
  return error;
}

function base64Url(data: Data): string {
  return data
    .toBase64String()
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomUrlSafe(): string {
  return base64Url(Crypto.generateSymmetricKey(256));
}

function savePending(value: PendingOAuth): void {
  if (!Keychain.set(PENDING_KEY, JSON.stringify(value))) {
    throw new Error("无法保存 Antigravity 临时授权状态");
  }
}

function readPending(): PendingOAuth | null {
  try {
    const value = JSON.parse(
      Keychain.get(PENDING_KEY) || "null",
    ) as Partial<PendingOAuth> | null;
    if (
      !value ||
      typeof value.state !== "string" ||
      typeof value.createdAt !== "number" ||
      typeof value.profileId !== "string"
    ) {
      return null;
    }
    return value as PendingOAuth;
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
    throw oauthError(
      `Antigravity 响应不是合法 JSON（HTTP ${response.status}）`,
      response.status,
    );
  }
}

function tokenErrorMessage(payload: TokenPayload, status: number): string {
  const nested = asObject(payload.error);
  const description =
    typeof payload.error_description === "string"
      ? payload.error_description.trim()
      : "";
  const nestedMessage =
    typeof nested?.message === "string" ? nested.message.trim() : "";
  const direct = typeof payload.error === "string" ? payload.error.trim() : "";
  return description || nestedMessage || direct || `HTTP ${status}`;
}

function tokenExpiry(expiresIn: unknown): number {
  const seconds =
    typeof expiresIn === "number" && Number.isFinite(expiresIn)
      ? expiresIn
      : 3600;
  return Date.now() + Math.max(60, seconds) * 1000;
}

async function exchangeCode(code: string): Promise<TokenPayload> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
    timeout: 25,
    debugLabel: "AntigravityTokenExchange",
  });
  const payload = (await jsonObject(response)) as TokenPayload;
  if (!response.ok || !payload.access_token) {
    throw oauthError(
      `Antigravity Token 交换失败：${tokenErrorMessage(payload, response.status)}`,
      response.status,
    );
  }
  return payload;
}

async function fetchIdentity(
  accessToken: string,
): Promise<{ email: string | null; accountId: string | null }> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15,
    debugLabel: "AntigravityUserInfo",
  });
  if (!response.ok) return { email: null, accountId: null };
  const payload = await jsonObject(response);
  return {
    email:
      typeof payload.email === "string" && payload.email.includes("@")
        ? payload.email
        : null,
    accountId: typeof payload.id === "string" ? payload.id : null,
  };
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

export async function startAntigravityLogin(
  profileId: string,
): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const state = randomUrlSafe();
  savePending({ state, createdAt: Date.now(), profileId });
  const params = new URLSearchParams({
    access_type: "offline",
    client_id: CLIENT_ID,
    prompt: "consent",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

export async function completeAntigravityLogin(input: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Antigravity 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 10 分钟，请重新授权");
  }
  try {
    const tokens = await exchangeCode(parseOAuthCallback(input, pending.state));
    const identity = await fetchIdentity(tokens.access_token!);
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: tokenExpiry(tokens.expires_in),
      email: identity.email,
      accountId: identity.accountId,
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
  if (
    !force &&
    current &&
    (!expiresAt || expiresAt > Date.now() + 5 * 60_000)
  ) {
    return current;
  }
  const refreshToken = getProfileRefreshToken(profileId);
  if (!refreshToken) return current;
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      timeout: 20,
      debugLabel: "AntigravityTokenRefresh",
    });
    const payload = (await jsonObject(response)) as TokenPayload;
    if (!response.ok || !payload.access_token) return current;
    const saved = saveProfileCredentials(profileId, {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || refreshToken,
      idToken: payload.id_token,
      expiresAt: tokenExpiry(payload.expires_in),
    });
    if (!saved) throw new CredentialPersistenceError();
    return payload.access_token;
  } catch (error) {
    if (isCredentialPersistenceError(error)) throw error;
    return current;
  }
}

/** CliRelay 账号状态探测：使用 Antigravity 客户端身份读取项目与套餐。 */
export async function fetchAccountInfo(
  accessToken: string,
): Promise<AntigravityProjectInfo> {
  let lastError: unknown = null;
  for (const host of CODE_ASSIST_HOSTS) {
    try {
      const response = await fetch(`${host}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": CLIENT_USER_AGENT,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "ANTIGRAVITY",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
        timeout: 15,
        debugLabel: "AntigravityAccountInfo",
      });
      if (response.ok) return parseProjectInfo(await jsonObject(response));
      lastError = oauthError(
        `Antigravity 账号信息请求失败 HTTP ${response.status}`,
        response.status,
      );
      if (shouldStopCodeAssistHostLoop(response.status)) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Antigravity 账号信息请求失败");
}
