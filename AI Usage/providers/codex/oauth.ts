import { activePendingAuthorization } from "../../services/oauth-pending";
import { CredentialPersistenceError } from "../../services/credential-errors";
import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  getProfileRefreshToken,
  getProfileTokenExpiresAt,
  saveProfileCredentials,
} from "./accounts";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE = "https://auth.openai.com";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE =
  "openid profile email offline_access api.connectors.read api.connectors.invoke";
const PENDING_KEY = "ai_usage_codex_oauth_pending_v1";
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
function clearPending(): void {
  try {
    Keychain.remove(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
function readPending(): PendingOAuth | null {
  try {
    const raw = Keychain.get(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingOAuth>;
    if (
      typeof value.state !== "string" ||
      typeof value.verifier !== "string" ||
      typeof value.createdAt !== "number" ||
      typeof value.profileId !== "string"
    )
      return null;
    return value as PendingOAuth;
  } catch {
    return null;
  }
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
function decodeJwtPayload(
  token: string | null,
): Record<string, unknown> | null {
  if (!token) return null;
  try {
    let raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (raw.length % 4) raw += "=";
    const json = decodeURIComponent(
      Array.from(atob(raw))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return asObject(JSON.parse(json));
  } catch {
    return null;
  }
}
function emailFromToken(token: string | null): string | null {
  const payload = decodeJwtPayload(token);
  const profile = asObject(payload?.["https://api.openai.com/profile"]);
  const value = payload?.email ?? profile?.email;
  return typeof value === "string" && value.includes("@") ? value : null;
}
function accountIdFromToken(token: string | null): string | null {
  const payload = decodeJwtPayload(token);
  const auth = asObject(payload?.["https://api.openai.com/auth"]);
  const value = payload?.chatgpt_account_id ?? auth?.chatgpt_account_id;
  return typeof value === "string" && value ? value : null;
}
async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return asObject(JSON.parse(text)) || {};
  } catch {
    throw new Error(`OAuth 响应异常（HTTP ${response.status}）`);
  }
}
async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
): Promise<TokenPayload> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  }).toString();
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    timeout: 25,
  });
  const data = (await parseJson(response)) as TokenPayload;
  if (!response.ok || !data.access_token)
    throw new Error(
      `Token 交换失败（HTTP ${response.status}），授权码可能已使用或过期`,
    );
  return data;
}
function authorizationUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "codex_cli_rs",
  });
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

/** 创建 PKCE 会话并返回官方授权 URL，由应用层用 Safari.present 打开。 */
export async function startOpenAILogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const state = randomUrlSafe();
  const pkce = createPkce();
  savePending({
    state,
    verifier: pkce.verifier,
    createdAt: Date.now(),
    profileId,
  });
  return authorizationUrl(state, pkce.challenge);
}

/** 校验用户粘贴的 localhost 回调 URL，交换 Token 并清理一次性状态。 */
export async function completeOpenAILogin(callbackText: string): Promise<void> {
  let raw = callbackText.trim();
  if (!raw) throw new Error("请粘贴浏览器地址栏中的完整回调 URL");
  // 兼容 Safari 地址栏复制时省略 scheme，例如 localhost:1455/auth/callback?...
  if (/^(localhost|127\.0\.0\.1):1455(?:\/|$)/i.test(raw))
    raw = `http://${raw}`;
  let callback: URL;
  try {
    callback = new URL(raw);
  } catch {
    throw new Error("回调 URL 格式无效");
  }
  const localHost =
    callback.hostname === "localhost" || callback.hostname === "127.0.0.1";
  if (
    callback.protocol !== "http:" ||
    !localHost ||
    callback.port !== "1455" ||
    callback.pathname !== "/auth/callback"
  ) {
    throw new Error("不是预期的 localhost:1455/auth/callback 地址");
  }
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的登录，请重新点击“开始官方授权”");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 10 分钟，请重新授权");
  }
  const errorCode = callback.searchParams.get("error");
  if (errorCode) {
    const description =
      callback.searchParams.get("error_description") || errorCode;
    clearPending();
    throw new Error(`OpenAI 拒绝授权：${description}`);
  }
  const state = callback.searchParams.get("state");
  if (!state || state !== pending.state)
    throw new Error(
      "OAuth state 校验失败；不要粘贴其他设备或其他登录会话的回调",
    );
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("回调 URL 中没有 authorization code");

  try {
    const tokens = await exchangeAuthorizationCode(code, pending.verifier);
    const identityToken = tokens.id_token || tokens.access_token || null;
    const accountId = accountIdFromToken(identityToken);
    const email = emailFromToken(identityToken);
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt:
        Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000,
      accountId,
      email,
    });
    if (!saved) throw new Error("Token 已获取，但本机 Keychain 保存失败");
    clearPending();
  } catch (e) {
    // authorization code 通常只能使用一次；失败后要求重新授权，避免状态含糊。
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
  if (!force && current && (!expiresAt || expiresAt > Date.now() + 5 * 60_000))
    return current;
  const refreshToken = getProfileRefreshToken(profileId);
  if (!refreshToken) return current;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    timeout: 20,
  });
  const tokens = (await parseJson(response)) as TokenPayload;
  if (!response.ok || !tokens.access_token) return current;
  const saved = saveProfileCredentials(profileId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    idToken: tokens.id_token,
    expiresAt:
      Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000,
    accountId: accountIdFromToken(tokens.id_token || tokens.access_token),
  });
  if (!saved) throw new CredentialPersistenceError();
  return tokens.access_token;
}
