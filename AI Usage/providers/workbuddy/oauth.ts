import { fetch } from "scripting";
import { captureAccountWork } from "../../services/account-work-guard";
import {
  createAuthorizationGuard,
  isAuthorizationCancelledError,
  throwIfAuthorizationCancelled,
  type AuthorizationSignal,
} from "../../services/auth-errors";
import { AuthorizationCheckDeferred } from "../../services/auth-single-check";
import { CredentialPersistenceError } from "../../services/credential-errors";
import { activePendingAuthorization } from "../../services/oauth-pending";
import { createAccountOperationFlight } from "../../services/runtime-consistency";
import {
  getProfileAccessToken,
  getProfileDomain,
  getProfileEnterpriseId,
  getProfileRefreshExpiresAt,
  getProfileRefreshToken,
  getProfileRegion,
  getProfileTokenExpiresAt,
  resolveProfile,
  saveProfileCredentials,
} from "./accounts";
import {
  endpointHost,
  regionFromInput,
  siteForRegion,
  WORKBUDDY_LOGIN_VERSION,
  type WorkbuddySite,
} from "./regions";
import type { WorkbuddyRegion } from "./types";

const PENDING_KEY = "ai_usage_workbuddy_oauth_pending_v1";
const PENDING_TTL_MS = 15 * 60_000;
const TOKEN_SKEW_MS = 60_000;
/** 上游“登录进行中/账号尚未就绪”等可继续轮询的业务码。 */
const PENDING_LOGIN_CODES = new Set([11217, 12151]);

type PendingAuth = {
  createdAt: number;
  profileId: string;
  region: WorkbuddyRegion;
  state: string;
  authUrl: string;
  /** 令牌已交换但账号信息尚未就绪时，后续检查复用它，避免重复消费 state。 */
  token?: TokenPayload;
};

type Envelope = {
  code: number;
  msg: string;
  data: Record<string, unknown> | null;
};

type TokenPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
  domain?: string;
  tokenType?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function randomHex32(): string {
  return Crypto.generateSymmetricKey(128).toHexString().slice(0, 32);
}

function savePending(value: PendingAuth): void {
  if (!Keychain.set(PENDING_KEY, JSON.stringify(value)))
    throw new Error("无法保存 WorkBuddy 授权状态");
}

function readPending(): PendingAuth | null {
  try {
    const raw = Keychain.get(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingAuth>;
    if (
      typeof value.createdAt !== "number" ||
      typeof value.profileId !== "string" ||
      (value.region !== "cn" && value.region !== "intl") ||
      typeof value.state !== "string" ||
      typeof value.authUrl !== "string" ||
      (value.token !== undefined &&
        (!asObject(value.token) || !firstString(value.token?.accessToken)))
    )
      return null;
    return value as PendingAuth;
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

function activePending(): PendingAuth | null {
  return activePendingAuthorization(readPending(), PENDING_TTL_MS, clearPending);
}

export function hasPendingOAuth(): boolean {
  return Boolean(activePending());
}

export function getPendingOAuthProfileId(): string | null {
  return activePending()?.profileId || null;
}

export function getPendingRegion(): WorkbuddyRegion | null {
  return activePending()?.region || null;
}

export function getPendingAuthorizationUrl(): string | null {
  return activePending()?.authUrl || null;
}

export function clearPendingOAuth(): void {
  clearPending();
}

async function readEnvelope(
  response: {
    ok: boolean;
    status: number;
    text(): Promise<string>;
  },
): Promise<Envelope> {
  const text = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }
  const code = Number(parsed?.code ?? 0);
  return {
    code: Number.isFinite(code) ? code : 0,
    msg:
      typeof parsed?.msg === "string"
        ? parsed.msg
        : typeof parsed?.message === "string"
          ? parsed.message
          : "",
    data: asObject(parsed?.data),
  };
}

/** 传输层失败（断网、超时）与其他终态错误的区分标记。 */
class WorkbuddyTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbuddyTransportError";
  }
}

async function call(
  site: WorkbuddySite,
  method: "GET" | "POST",
  path: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; envelope: Envelope }> {
  const response = await fetch(site.endpoint + path, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": `WorkBuddy/${site.appVersion}`,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    timeout: 20,
    debugLabel: `Workbuddy${site.region === "cn" ? "Cn" : "Intl"}Auth`,
  }).catch((error: unknown) => {
    throw new WorkbuddyTransportError(
      error instanceof Error ? error.message : String(error),
    );
  });
  return {
    ok: response.ok,
    status: response.status,
    envelope: await readEnvelope(response),
  };
}

function noAuthHeaders(site: WorkbuddySite): Record<string, string> {
  return {
    "X-No-Authorization": "true",
    "X-No-User-Id": "true",
    "X-No-Enterprise-Id": "true",
    "X-No-Department-Info": "true",
    "User-Agent": `WorkBuddy/${site.appVersion}`,
  };
}

function enterpriseHeaders(enterpriseId: string | null): Record<string, string> {
  return enterpriseId
    ? { "X-Enterprise-Id": enterpriseId, "X-Tenant-Id": enterpriseId }
    : {};
}

function domainFor(
  site: WorkbuddySite,
  domain: string | null | undefined,
): string {
  return domain || endpointHost(site.region);
}

function tokenResult(
  site: WorkbuddySite,
  data: Record<string, unknown> | null,
): TokenPayload | null {
  const accessToken = firstString(data?.accessToken);
  if (!accessToken) return null;
  const expiresAt = toPositiveNumber(data?.expiresAt);
  const expiresIn = toPositiveNumber(data?.expiresIn);
  const refreshExpiresAt = toPositiveNumber(data?.refreshExpiresAt);
  const refreshExpiresIn = toPositiveNumber(data?.refreshExpiresIn);
  const now = Date.now();
  return {
    accessToken,
    refreshToken: firstString(data?.refreshToken) || undefined,
    expiresAt: expiresAt ?? (expiresIn ? now + expiresIn * 1000 : undefined),
    refreshExpiresAt:
      refreshExpiresAt ?? (refreshExpiresIn ? now + refreshExpiresIn * 1000 : undefined),
    domain: firstString(data?.domain) || undefined,
    tokenType: firstString(data?.tokenType) || undefined,
  };
}

function maskPhone(value: string): string {
  if (!/^\d{6,}$/.test(value)) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

/** 暂时性失败（可继续轮询）与终态失败的判定。 */
function isTransientAuthFailure(status: number, code: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    PENDING_LOGIN_CODES.has(code)
  );
}

export async function startWorkbuddyLogin(
  profileId: string,
  input?: string,
): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const region = regionFromInput(input);
  const site = siteForRegion(region);
  const result = await call(
    site,
    "POST",
    `/v2/plugin/auth/state?platform=${encodeURIComponent(site.platform)}`,
    noAuthHeaders(site),
    {},
  );
  const state = firstString(result.envelope.data?.state);
  const authUrl = firstString(result.envelope.data?.authUrl);
  if (!result.ok || result.envelope.code !== 0 || !state || !authUrl) {
    throw new Error(
      result.envelope.msg || `${site.label}没有返回登录地址（HTTP ${result.status}）`,
    );
  }
  let url: URL;
  try {
    url = new URL(authUrl);
  } catch {
    throw new Error(`${site.label}返回的登录地址无效`);
  }
  if (url.protocol !== "https:") throw new Error(`${site.label}登录地址不是 https`);
  url.searchParams.set("version", WORKBUDDY_LOGIN_VERSION);
  url.searchParams.set("loginSessionId", randomHex32());
  savePending({
    createdAt: Date.now(),
    profileId,
    region,
    state,
    authUrl: url.toString(),
  });
  return url.toString();
}

type LoginAccount = {
  uid: string;
  name: string;
  email: string | null;
  type: string;
  enterpriseId: string | null;
};

async function loginAccount(
  site: WorkbuddySite,
  state: string,
  token: TokenPayload,
): Promise<LoginAccount> {
  const response = await call(
    site,
    "GET",
    `/v2/plugin/login/account?state=${encodeURIComponent(state)}`,
    {
      Authorization: `Bearer ${token.accessToken}`,
      "X-Domain": domainFor(site, token.domain),
      "X-No-User-Id": "true",
      "X-No-Enterprise-Id": "true",
    },
  );
  const data = response.envelope.data;
  const uid = firstString(data?.uid);
  if (isTransientAuthFailure(response.status, response.envelope.code)) {
    throw new AuthorizationCheckDeferred(
      "WorkBuddy 账号信息尚未就绪，请继续在网页中完成登录",
    );
  }
  if (!response.ok || response.envelope.code !== 0 || !uid) {
    throw new Error(response.envelope.msg || `${site.label}没有返回账号信息`);
  }
  const nickname = firstString(data?.nickname);
  const phone = firstString(data?.phoneNumber);
  const emailRaw = firstString(data?.email);
  return {
    uid,
    name: nickname || (phone ? maskPhone(phone) : uid.slice(0, 8)),
    email: emailRaw && emailRaw.includes("@") ? emailRaw : null,
    type: (firstString(data?.type) || "personal").toLowerCase(),
    enterpriseId: firstString(data?.enterpriseId),
  };
}

async function discoverEnterpriseId(
  site: WorkbuddySite,
  state: string,
  token: TokenPayload,
  account: LoginAccount,
): Promise<string> {
  if (account.enterpriseId) return account.enterpriseId;
  if (!account.type || account.type === "personal") return "";
  try {
    const response = await call(
      site,
      "GET",
      "/v2/plugin/accounts",
      {
        Authorization: `Bearer ${token.accessToken}`,
        "X-Domain": domainFor(site, token.domain),
      },
    );
    const accounts = Array.isArray(response.envelope.data?.accounts)
      ? response.envelope.data?.accounts
      : [];
    const mine = accounts
      .map((value) => asObject(value))
      .filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && value?.uid === account.uid,
      )
      .filter((value) => typeof value.enterpriseId === "string" && value.enterpriseId.trim());
    const sameType = mine.filter(
      (value) =>
        String(value.type || "").trim().toLowerCase() === account.type,
    );
    const lastLogin = mine.filter((value) => Boolean(value.lastLogin));
    const pick =
      sameType.length === 1
        ? sameType[0]
        : lastLogin.length === 1
          ? lastLogin[0]
          : mine.length === 1
            ? mine[0]
            : null;
    return pick ? String(pick.enterpriseId).trim() : "";
  } catch {
    return "";
  }
}

function pendingIdentity(pending: PendingAuth): Omit<PendingAuth, "token"> {
  return {
    createdAt: pending.createdAt,
    profileId: pending.profileId,
    region: pending.region,
    state: pending.state,
    authUrl: pending.authUrl,
  };
}

function clearPendingIfCurrent(pending: PendingAuth): void {
  const current = readPending();
  if (!current) return;
  if (
    current.state !== pending.state ||
    current.profileId !== pending.profileId ||
    current.createdAt !== pending.createdAt
  )
    return;
  clearPending();
}

export async function completeWorkbuddyLogin(
  _input?: string,
  signal?: AuthorizationSignal,
): Promise<void> {
  throwIfAuthorizationCancelled(signal);
  const pending = activePending();
  if (!pending) throw new Error("未找到待完成的 WorkBuddy 授权，请重新开始");
  const assertCurrent = createAuthorizationGuard(
    pendingIdentity(pending),
    () => {
      const current = readPending();
      return current ? pendingIdentity(current) : null;
    },
    signal,
  );
  const site = siteForRegion(pending.region);
  try {
    let token = pending.token;
    if (!token) {
      const response = await call(
        site,
        "GET",
        `/v2/plugin/auth/token?state=${encodeURIComponent(pending.state)}`,
        { "User-Agent": `WorkBuddy/${site.appVersion}` },
      );
      assertCurrent();
      if (isTransientAuthFailure(response.status, response.envelope.code)) {
        throw new AuthorizationCheckDeferred(
          "尚未完成 WorkBuddy 登录，请继续在网页中完成",
        );
      }
      if (!response.ok || response.envelope.code !== 0) {
        throw new Error(
          response.envelope.msg ||
            `WorkBuddy 授权失败（HTTP ${response.status}）`,
        );
      }
      token = tokenResult(site, response.envelope.data) || undefined;
      if (!token) {
        throw new AuthorizationCheckDeferred(
          "WorkBuddy 尚未返回 access token，请继续在网页中完成登录",
        );
      }
      // 临时状态位于 Keychain；交换后先保存，身份接口稍后就绪时不再重复交换。
      try {
        savePending({ ...pending, token });
      } catch {
        throw new CredentialPersistenceError("无法保存 WorkBuddy 临时登录凭据");
      }
    }
    assertCurrent();
    const account = await loginAccount(site, pending.state, token);
    assertCurrent();
    const enterpriseId = await discoverEnterpriseId(
      site,
      pending.state,
      token,
      account,
    );
    assertCurrent();
    const name = account.name;
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? null,
      expiresAt: token.expiresAt ?? null,
      refreshExpiresAt: token.refreshExpiresAt ?? null,
      domain: token.domain ?? null,
      tokenType: token.tokenType ?? null,
      uid: account.uid,
      enterpriseId: enterpriseId || null,
      region: pending.region,
      accountId: account.uid,
      email: account.email,
      name,
    });
    if (!saved)
      throw new CredentialPersistenceError(
        "WorkBuddy 授权成功，但本机 Keychain 保存失败",
      );
    clearPendingIfCurrent(pending);
  } catch (error) {
    // 可继续检查及取消保留当前 pending；
    // 终态错误（含凭据保存失败）只清理本次授权，不误删更晚发起的授权。
    throwIfAuthorizationCancelled(signal);
    if (error instanceof AuthorizationCheckDeferred) throw error;
    if (isAuthorizationCancelledError(error)) throw error;
    if (error instanceof WorkbuddyTransportError) {
      throw new AuthorizationCheckDeferred("暂时无法确认 WorkBuddy 授权结果");
    }
    clearPendingIfCurrent(pending);
    throw error;
  }
}

function mergeToken(
  profileId: string,
  got: TokenPayload,
): {
  access: string;
  refresh: string | null;
  expiresAt: number | null;
  refreshExpiresAt: number;
  domain: string | null;
  tokenType: string | null;
} {
  return {
    access: got.accessToken,
    refresh: got.refreshToken || getProfileRefreshToken(profileId),
    // 刷新响应没给新有效期时按“未知”保存，避免沿用旧时间戳把新 token 立刻判为过期。
    expiresAt: got.expiresAt ?? null,
    refreshExpiresAt:
      got.refreshExpiresAt || getProfileRefreshExpiresAt(profileId),
    domain: got.domain || getProfileDomain(profileId),
    tokenType: got.tokenType || null,
  };
}

/** 只做网络刷新并返回 token 数据；写盘由调用方在陈旧检查之后完成。 */
async function renew(
  profileId: string,
  site: WorkbuddySite,
  refreshToken: string,
): Promise<TokenPayload | null> {
  const response = await call(
    site,
    "POST",
    "/v2/plugin/auth/token/refresh",
    {
      "X-Refresh-Token": refreshToken,
      "X-Auth-Refresh-Source": "plugin",
      "X-Domain": domainFor(site, getProfileDomain(profileId)),
      ...enterpriseHeaders(getProfileEnterpriseId(profileId)),
    },
    {},
  );
  if (!response.ok || response.envelope.code !== 0) return null;
  return tokenResult(site, response.envelope.data);
}

const renewAccount = createAccountOperationFlight<{
  token: string | null;
  forced: boolean;
}>();

/**
 * 刷新只在当前 JS 运行时内按 profile 单飞（非跨进程 OS 锁）；
 * 其他进程写入的新凭据由 performTokenRefresh 的代数与凭据比对保护。
 */
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
  // 先固定刷新前的账号代数与凭据，await 之后据此丢弃旧结果。
  const currentWork = captureAccountWork("workbuddy", profileId);
  const accessBefore = getProfileAccessToken(profileId);
  const refreshBefore = getProfileRefreshToken(profileId);
  const regionBefore = getProfileRegion(profileId);
  const domainBefore = getProfileDomain(profileId);
  const enterpriseBefore = getProfileEnterpriseId(profileId);
  const expiresAt = getProfileTokenExpiresAt(profileId);
  // 到期时间未知（0）且已有 access 时不主动刷新，等 401 后的 force 刷新。
  if (
    !force &&
    accessBefore &&
    (!expiresAt || expiresAt > Date.now() + TOKEN_SKEW_MS)
  )
    return accessBefore;
  if (!refreshBefore)
    return accessBefore && (!expiresAt || expiresAt > Date.now())
      ? accessBefore
      : null;
  const refreshExpiresAt = getProfileRefreshExpiresAt(profileId);
  if (refreshExpiresAt > 0 && refreshExpiresAt <= Date.now())
    return accessBefore && (!expiresAt || expiresAt > Date.now())
      ? accessBefore
      : null;
  let token: TokenPayload | null;
  try {
    token = await renew(
      profileId,
      siteForRegion(regionBefore || "intl"),
      refreshBefore,
    );
  } catch {
    token = null;
  }
  // 即使旧请求失败，也必须先排除新登录/恢复；不能向调用方返回旧身份的 access。
  // 旧刷新结果不得覆盖新登录、恢复或删除；其他进程已写入新凭据时优先返回最新。
  if (!currentWork()) return getProfileAccessToken(profileId);
  if (
    getProfileAccessToken(profileId) !== accessBefore ||
    getProfileRefreshToken(profileId) !== refreshBefore ||
    getProfileRegion(profileId) !== regionBefore ||
    getProfileDomain(profileId) !== domainBefore ||
    getProfileEnterpriseId(profileId) !== enterpriseBefore
  )
    return getProfileAccessToken(profileId);
  if (!resolveProfile(profileId)) return null;
  if (!token)
    return accessBefore && (!expiresAt || expiresAt > Date.now())
      ? accessBefore
      : null;
  const merged = mergeToken(profileId, token);
  const saved = saveProfileCredentials(profileId, {
    accessToken: merged.access,
    refreshToken: merged.refresh,
    expiresAt: merged.expiresAt,
    refreshExpiresAt: merged.refreshExpiresAt,
    domain: merged.domain,
    tokenType: merged.tokenType,
  });
  if (!saved) throw new CredentialPersistenceError();
  return merged.access;
}
