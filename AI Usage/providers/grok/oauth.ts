import { activePendingAuthorization } from "../../services/oauth-pending";
import { CredentialPersistenceError } from "../../services/credential-errors";
import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  getProfileRefreshToken,
  getProfileTokenExpiresAt,
  saveProfileCredentials,
} from "./accounts";

const CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const AUTHORIZATION_URL = "https://auth.x.ai/oauth2/authorize";
const TOKEN_URL = "https://auth.x.ai/oauth2/token";
const USERINFO_URL = "https://auth.x.ai/oauth2/userinfo";
const REDIRECT_URI = "http://127.0.0.1:56122/callback";
const SCOPE = "openid profile email offline_access grok-cli:access api:access";
const PENDING_KEY = "ai_usage_grok_oauth_pending_v2";
const PENDING_TTL_MS = 10 * 60_000;

type PendingOAuth = {
  state: string;
  nonce: string;
  verifier: string;
  createdAt: number;
  profileId: string;
};
type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
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
function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomUrlSafe();
  const bytes = Data.fromRawString(verifier, "utf-8");
  if (!bytes) throw new Error("无法生成 PKCE 数据");
  return { verifier, challenge: base64Url(Crypto.sha256(bytes)) };
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
      !value.state ||
      !value.nonce ||
      !value.verifier ||
      !value.createdAt ||
      !value.profileId
    )
      return null;
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
function decodeJwtPayload(
  token: string | null,
): Record<string, unknown> | null {
  if (!token) return null;
  try {
    let raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (raw.length % 4) raw += "=";
    return asObject(
      JSON.parse(
        decodeURIComponent(
          Array.from(atob(raw))
            .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join(""),
        ),
      ),
    );
  } catch {
    return null;
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
async function fetchIdentity(
  token: string,
): Promise<{ email: string | null; accountId: string | null }> {
  const jwt = decodeJwtPayload(token);
  let email = typeof jwt?.email === "string" ? jwt.email : null;
  let accountId = typeof jwt?.sub === "string" ? jwt.sub : null;
  try {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      timeout: 15,
    });
    if (response.ok) {
      const data = await jsonObject(response);
      if (typeof data.email === "string") email = data.email;
      if (typeof data.sub === "string") accountId = data.sub;
    }
  } catch {
    /* JWT identity is sufficient */
  }
  return { email: email && email.includes("@") ? email : null, accountId };
}
function authorizationUrl(
  state: string,
  nonce: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
    plan: "generic",
    referrer: "ai-usage-scripting",
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}
function parseAuthorizationInput(input: string, expectedState: string): string {
  let value = input.trim();
  if (!value) throw new Error("请粘贴完整回调 URL 或 xAI 一次性授权码");
  if (/^(127\.0\.0\.1|localhost):56122(?:\/|$)/i.test(value))
    value = `http://${value}`;
  try {
    const url = new URL(value);
    if (url.pathname !== "/callback") throw new Error("回调路径不是 /callback");
    const error = url.searchParams.get("error");
    if (error)
      throw new Error(url.searchParams.get("error_description") || error);
    const state = url.searchParams.get("state");
    if (!state || state !== expectedState)
      throw new Error("OAuth state 校验失败");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("回调 URL 中没有 authorization code");
    return code;
  } catch (e) {
    if (/^[A-Za-z0-9._~-]{32,2048}$/.test(value) && !value.includes("="))
      return value;
    throw e instanceof Error ? e : new Error("授权回调格式无效");
  }
}
async function exchangeCode(
  code: string,
  verifier: string,
): Promise<TokenPayload> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }).toString();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    timeout: 25,
  });
  const data = (await jsonObject(response)) as TokenPayload;
  if (!response.ok || !data.access_token)
    throw new Error(
      data.error_description ||
        data.error ||
        `Token 交换失败（HTTP ${response.status}）`,
    );
  return data;
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

/** 创建 xAI Authorization Code + PKCE 会话并返回官方授权 URL。 */
export async function startGrokLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const state = randomUrlSafe(),
    nonce = randomUrlSafe(),
    pkce = createPkce();
  savePending({
    state,
    nonce,
    verifier: pkce.verifier,
    createdAt: Date.now(),
    profileId,
  });
  return authorizationUrl(state, nonce, pkce.challenge);
}

/** 接受完整 127.0.0.1 回调 URL，或 xAI 页面显示的一次性授权码。 */
export async function completeGrokLogin(callbackOrCode: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Grok 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 10 分钟，请重新授权");
  }
  try {
    const code = parseAuthorizationInput(callbackOrCode, pending.state);
    const tokens = await exchangeCode(code, pending.verifier);
    const identity = await fetchIdentity(
      tokens.id_token || tokens.access_token!,
    );
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt:
        Date.now() + Math.max(60, Number(tokens.expires_in) || 900) * 1000,
      accountId: identity.accountId,
      email: identity.email,
    });
    if (!saved) throw new Error("Token 已获取，但本机 Keychain 保存失败");
    clearPending();
  } catch (e) {
    clearPending();
    throw e;
  }
}

export async function refreshOAuthToken(
  profileId: string,
  force = false,
): Promise<string | null> {
  const current = getProfileAccessToken(profileId),
    expiresAt = getProfileTokenExpiresAt(profileId);
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
  });
  const tokens = (await jsonObject(response)) as TokenPayload;
  if (!response.ok || !tokens.access_token) return current;
  const identity = await fetchIdentity(tokens.id_token || tokens.access_token);
  const saved = saveProfileCredentials(profileId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    idToken: tokens.id_token,
    expiresAt:
      Date.now() + Math.max(60, Number(tokens.expires_in) || 900) * 1000,
    accountId: identity.accountId,
    email: identity.email,
  });
  if (!saved) throw new CredentialPersistenceError();
  return tokens.access_token;
}
