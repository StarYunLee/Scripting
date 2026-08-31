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

// Claude Code 公共 OAuth 客户端。OAuth 与 usage 端点由 Anthropic 自有域名提供，
// 但它们属于 Claude Code 登录/用量链路，不是面向第三方承诺稳定的公共 API。
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZATION_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const SCOPE = "org:create_api_key user:profile user:inference";
const PENDING_KEY = "ai_usage_claude_oauth_pending_v3";
const PENDING_TTL_MS = 10 * 60_000;

type PendingOAuth = {
  state: string;
  verifier: string;
  createdAt: number;
  profileId: string;
};
type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  expires_at?: number;
  error?: unknown;
  error_description?: unknown;
  request_id?: unknown;
  account?: { uuid?: string; email_address?: string; email?: string };
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
    if (!value.state || !value.verifier || !value.createdAt || !value.profileId)
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
  if (!token || token.split(".").length < 3) return null;
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
function oauthErrorMessage(
  data: TokenPayload,
  status: number,
): { message: string; type: string | null; requestId: string | null } {
  const nested = asObject(data.error);
  const description =
    typeof data.error_description === "string"
      ? data.error_description.trim()
      : "";
  const nestedMessage =
    typeof nested?.message === "string" ? nested.message.trim() : "";
  const directError = typeof data.error === "string" ? data.error.trim() : "";
  const nestedType = typeof nested?.type === "string" ? nested.type.trim() : "";
  const requestId =
    typeof data.request_id === "string" ? data.request_id : null;
  return {
    message:
      description ||
      nestedMessage ||
      directError ||
      nestedType ||
      `Token 请求失败（HTTP ${status}）`,
    type: nestedType || directError || null,
    requestId,
  };
}
function identityFromTokens(tokens: TokenPayload): {
  email: string | null;
  accountId: string | null;
} {
  const jwt = decodeJwtPayload(tokens.id_token || tokens.access_token || null);
  const account = tokens.account;
  const email =
    account?.email_address ||
    account?.email ||
    (typeof jwt?.email === "string" ? jwt.email : null);
  const accountId =
    account?.uuid || (typeof jwt?.sub === "string" ? jwt.sub : null);
  return {
    email: email && email.includes("@") ? email : null,
    accountId: accountId || null,
  };
}
function authorizationUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    code: "true",
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}
function parseAuthorizationInput(
  input: string,
  expectedState: string,
): { code: string; state: string } {
  let value = input.trim();
  if (!value) throw new Error("请粘贴 Anthropic 页面显示的授权码");

  // 支持粘贴 hosted callback URL。
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const error = url.searchParams.get("error");
    if (error)
      throw new Error(url.searchParams.get("error_description") || error);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || expectedState;
    if (!code) throw new Error("回调地址中没有 authorization code");
    if (state !== expectedState) throw new Error("OAuth state 校验失败");
    return { code, state };
  }

  // 手动授权码通常为 code#state，也支持只粘贴 code。
  const splitAt = value.lastIndexOf("#");
  if (splitAt > 0) {
    const code = value.slice(0, splitAt).trim();
    const state = value.slice(splitAt + 1).trim();
    if (!code || state !== expectedState)
      throw new Error("OAuth state 校验失败");
    return { code, state };
  }
  if (!/^[A-Za-z0-9._~+/=-]{16,4096}$/.test(value))
    throw new Error("Anthropic 授权码格式无效");
  return { code: value, state: expectedState };
}
async function tokenRequest(
  payload: Record<string, string>,
): Promise<TokenPayload> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "anthropic",
    },
    body: JSON.stringify(payload),
    timeout: 25,
  });
  const data = (await jsonObject(response)) as TokenPayload;
  if (!response.ok || !data.access_token) {
    const error = oauthErrorMessage(data, response.status);
    throw new Error(error.message);
  }
  return data;
}
function tokenExpiry(tokens: TokenPayload): number {
  if (
    typeof tokens.expires_at === "number" &&
    Number.isFinite(tokens.expires_at)
  ) {
    return tokens.expires_at > 10_000_000_000
      ? tokens.expires_at
      : tokens.expires_at * 1000;
  }
  return Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000;
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

/** 创建 Claude Code Authorization Code + PKCE 会话并返回官方授权 URL。 */
export async function startClaudeLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const pkce = createPkce();
  const state = randomUrlSafe();
  savePending({
    state,
    verifier: pkce.verifier,
    createdAt: Date.now(),
    profileId,
  });
  return authorizationUrl(state, pkce.challenge);
}

/** 接受 Anthropic hosted callback 页面显示的授权码（通常为 code#state）。 */
export async function completeClaudeLogin(
  callbackOrCode: string,
): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Claude 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 10 分钟，请重新授权");
  }
  try {
    const parsed = parseAuthorizationInput(callbackOrCode, pending.state);
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code: parsed.code,
      state: parsed.state,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: pending.verifier,
    });
    const identity = identityFromTokens(tokens);
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: tokenExpiry(tokens),
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
  const current = getProfileAccessToken(profileId);
  const expiresAt = getProfileTokenExpiresAt(profileId);
  if (!force && current && (!expiresAt || expiresAt > Date.now() + 3 * 60_000))
    return current;
  const refreshToken = getProfileRefreshToken(profileId);
  if (!refreshToken) return current;
  try {
    const tokens = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    const identity = identityFromTokens(tokens);
    const saved = saveProfileCredentials(profileId, {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token || refreshToken,
      idToken: tokens.id_token,
      expiresAt: tokenExpiry(tokens),
      accountId: identity.accountId,
      email: identity.email,
    });
    if (!saved) throw new CredentialPersistenceError();
    return tokens.access_token || current;
  } catch (error) {
    if (isCredentialPersistenceError(error)) throw error;
    return current;
  }
}
