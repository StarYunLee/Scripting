import { fetch, Response } from "scripting";
import {
  getProfileAccessToken,
  getProfileRefreshToken,
  getProfileTokenExpiresAt,
  saveProfileCredentials,
} from "./accounts";

const CURSOR_LOGIN_URL = "https://cursor.com/loginDeepControl";
const CURSOR_POLL_URL = "https://api2.cursor.sh/auth/poll";
const CURSOR_REFRESH_URL = "https://api2.cursor.sh/auth/exchange_user_api_key";
const PENDING_KEY = "ai_usage_cursor_oauth_pending_v1";
const PENDING_TTL_MS = 10 * 60_000;
const POLL_MAX_ATTEMPTS = 150;
const POLL_BASE_DELAY_MS = 1000;
const POLL_MAX_DELAY_MS = 10_000;
const POLL_BACKOFF = 1.2;
const EXPIRY_SKEW_MS = 5 * 60_000;
const FALLBACK_TTL_MS = 60 * 60_000;

type PendingOAuth = {
  uuid: string;
  verifier: string;
  createdAt: number;
  profileId: string;
};

type TokenPayload = {
  accessToken?: string;
  refreshToken?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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

function createUuid(): string {
  const bytes = Crypto.generateSymmetricKey(128);
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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
      !value.uuid ||
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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
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

function tokenExpiry(token: string): number {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp === "number" && Number.isFinite(exp))
    return exp * 1000 - EXPIRY_SKEW_MS;
  return Date.now() + FALLBACK_TTL_MS;
}

function emailFromObject(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  for (const key of [
    "email",
    "userEmail",
    "user_email",
    "preferred_username",
    "upn",
    "unique_name",
  ]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.includes("@"))
      return candidate.trim();
  }
  const customer = asObject(value.customer);
  if (customer) {
    const nested = emailFromObject(customer);
    if (nested) return nested;
  }
  const user = asObject(value.user);
  if (user) {
    const nested = emailFromObject(user);
    if (nested) return nested;
  }
  return null;
}

function accountIdFromObject(
  value: Record<string, unknown> | null,
): string | null {
  if (!value) return null;
  for (const key of ["sub", "userId", "user_id", "id", "accountId", "account_id"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
    if (typeof candidate === "number" && Number.isSafeInteger(candidate))
      return String(candidate);
  }
  return null;
}

async function fetchEmailFromStripeProfile(
  token: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api2.cursor.sh/auth/full_stripe_profile",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        timeout: 15,
        debugLabel: "CursorStripeProfile",
      },
    );
    if (!response.ok) return null;
    return emailFromObject(await jsonObject(response));
  } catch {
    return null;
  }
}

async function resolveIdentity(
  token: string,
  extra?: Record<string, unknown> | null,
): Promise<{ email: string | null; accountId: string | null }> {
  const jwt = decodeJwtPayload(token);
  let email =
    emailFromObject(jwt) ||
    emailFromObject(extra || null) ||
    null;
  if (!email) email = await fetchEmailFromStripeProfile(token);
  const accountId =
    accountIdFromObject(jwt) || accountIdFromObject(extra || null);
  return { email, accountId };
}

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return asObject(JSON.parse(text)) || {};
  } catch {
    throw new Error(`OAuth 响应异常（HTTP ${response.status}）`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForTokens(
  uuid: string,
  verifier: string,
): Promise<TokenPayload & Record<string, unknown>> {
  let delay = POLL_BASE_DELAY_MS;
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(delay);
    try {
      const url = `${CURSOR_POLL_URL}?uuid=${encodeURIComponent(uuid)}&verifier=${encodeURIComponent(verifier)}`;
      const response = await fetch(url, { timeout: 20, debugLabel: "CursorAuthPoll" });

      if (response.status === 404) {
        consecutiveErrors = 0;
        delay = Math.min(delay * POLL_BACKOFF, POLL_MAX_DELAY_MS);
        continue;
      }

      if (response.ok) {
        const data = await jsonObject(response);
        if (!data.accessToken || !data.refreshToken)
          throw new Error("Cursor 授权响应缺少 Token");
        return data as TokenPayload & Record<string, unknown>;
      }

      if ([400, 401, 403, 410].includes(response.status))
        throw new Error(`Cursor 授权被拒绝（HTTP ${response.status}），请重新开始`);

      throw new Error(`Cursor 授权轮询失败（HTTP ${response.status}）`);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("授权被拒绝") ||
          error.message.includes("授权响应缺少"))
      )
        throw error;
      consecutiveErrors++;
      if (consecutiveErrors >= 3)
        throw new Error("Cursor 授权轮询连续失败，请稍后重试");
      delay = Math.min(delay * POLL_BACKOFF, POLL_MAX_DELAY_MS);
    }
  }

  throw new Error("Cursor 授权等待超时，请确认已在浏览器完成登录后重试");
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

export async function startCursorLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const pkce = createPkce();
  const uuid = createUuid();
  savePending({
    uuid,
    verifier: pkce.verifier,
    createdAt: Date.now(),
    profileId,
  });
  const params = new URLSearchParams({
    challenge: pkce.challenge,
    uuid,
    mode: "login",
    redirectTarget: "cli",
  });
  return `${CURSOR_LOGIN_URL}?${params.toString()}`;
}

export async function completeCursorLogin(_input?: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Cursor 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("OAuth 会话已超过 10 分钟，请重新授权");
  }
  try {
    const tokens = await pollForTokens(pending.uuid, pending.verifier);
    const identity = await resolveIdentity(tokens.accessToken!, tokens);
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: tokens.accessToken!,
      refreshToken: tokens.refreshToken,
      expiresAt: tokenExpiry(tokens.accessToken!),
      accountId: identity.accountId,
      email: identity.email,
    });
    if (!saved) throw new Error("Token 已获取，但本机 Keychain 保存失败");
    clearPending();
  } catch (error) {
    clearPending();
    throw error;
  }
}

/** 在缺少邮箱时回填账号显示名（JWT → 轮询字段 → Stripe profile）。 */
export async function ensureAccountEmail(
  profileId: string,
  token?: string | null,
): Promise<string | null> {
  const accessToken = token || getProfileAccessToken(profileId);
  if (!accessToken) return null;
  const identity = await resolveIdentity(accessToken);
  // 只有拿到邮箱才回写，避免仅有 accountId 时把展示名改坏。
  if (!identity.email) return null;
  saveProfileCredentials(profileId, {
    accessToken,
    accountId: identity.accountId,
    email: identity.email,
  });
  return identity.email;
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
  const response = await fetch(CURSOR_REFRESH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${refreshToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
    timeout: 20,
    debugLabel: "CursorTokenRefresh",
  });
  const data = await jsonObject(response);
  if (!response.ok || typeof data.accessToken !== "string") return current;
  const identity = await resolveIdentity(data.accessToken, data);
  saveProfileCredentials(profileId, {
    accessToken: data.accessToken,
    refreshToken:
      typeof data.refreshToken === "string" ? data.refreshToken : refreshToken,
    expiresAt: tokenExpiry(data.accessToken),
    accountId: identity.accountId,
    email: identity.email,
  });
  return data.accessToken;
}
