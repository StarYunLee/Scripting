import { fetch } from "scripting";
import { parseJwtPayload } from "../../services/jwt-payload";
import {
  getProfileAccessToken,
  getProfileRegion,
  saveProfileCredentials,
} from "./accounts";
import { regionDisplayName } from "./format";
import { chooseMinimaxRegion } from "./region-selection";
import { consoleUrlForRegion, quotaUrls, userInfoUrls } from "./regions";
import type { MinimaxRegion } from "./types";

const PENDING_KEY = "ai_usage_minimax_oauth_pending_v1";
const PENDING_TTL_MS = 15 * 60_000;

type PendingAuth = {
  createdAt: number;
  profileId: string;
  region: MinimaxRegion;
};

export type MinimaxIdentity = {
  email: string | null;
  accountId: string | null;
  name: string | null;
};

function savePending(value: PendingAuth): void {
  if (!Keychain.set(PENDING_KEY, JSON.stringify(value)))
    throw new Error("无法保存临时授权状态");
}

function readPending(): PendingAuth | null {
  try {
    const raw = Keychain.get(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingAuth>;
    if (!value.createdAt || !value.profileId) return null;
    return {
      createdAt: value.createdAt,
      profileId: value.profileId,
      region: value.region === "cn" ? "cn" : "intl",
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

export function minimaxRequestHeaders(
  token?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "AI-Usage-Scripting/1.1.2",
  };
  if (token) {
    const trimmed = token.trim();
    headers.Authorization = trimmed.toLowerCase().startsWith("bearer ")
      ? trimmed
      : `Bearer ${trimmed}`;
  }
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

export function getPendingRegion(): MinimaxRegion | null {
  const pending = readPending();
  return pending && Date.now() - pending.createdAt <= PENDING_TTL_MS
    ? pending.region
    : null;
}

export async function startMinimaxLogin(
  profileId: string,
  input?: string,
): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  const region: MinimaxRegion = input === "cn" ? "cn" : "intl";
  savePending({ createdAt: Date.now(), profileId, region });
  return consoleUrlForRegion(region);
}

function normalizeApiKey(input: string): string {
  const trimmed = input.trim().replace(/^Bearer\s+/i, "");
  if (!trimmed || trimmed.length < 8)
    throw new Error("请粘贴完整的 MiniMax Subscription Key");
  return trimmed;
}

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

function parseIdentityPayload(payload: unknown): MinimaxIdentity | null {
  const object = asObject(payload);
  if (!object) return null;
  const base = asObject(object.base_resp);
  const statusCode =
    typeof base?.status_code === "number" ? base.status_code : null;
  if (statusCode != null && statusCode !== 0) return null;

  const data =
    asObject(object.data) ||
    asObject(object.user) ||
    asObject(object.user_info) ||
    asObject(object.biz_info) ||
    object;

  const email = firstString(
    data.email,
    data.mail,
    data.user_email,
    object.email,
    object.mail,
  );
  const emailOk = email && email.includes("@") ? email : null;

  const accountId = firstString(
    data.user_id,
    data.uid,
    data.id,
    data.account_id,
    data.subject,
    object.user_id,
    object.uid,
    object.account_id,
  );

  const org = firstString(
    data.org_name,
    data.organization_name,
    data.organization,
    data.group_name,
    data.company_name,
    data.team_name,
  );
  const nickname = firstString(
    data.nickname,
    data.nick_name,
    data.user_name,
    data.username,
    data.name,
    data.display_name,
    object.nickname,
    object.name,
  );

  const name = nickname || org || emailOk;
  if (!emailOk && !accountId && !name) return null;
  return { email: emailOk, accountId, name };
}

function identityFromJwt(token: string): MinimaxIdentity | null {
  const jwt = parseJwtPayload(token);
  if (!jwt) return null;
  const emailRaw = firstString(jwt.email, jwt.mail, jwt.user_email);
  const email =
    emailRaw && emailRaw.includes("@") ? emailRaw : null;
  const accountId = firstString(
    jwt.sub,
    jwt.user_id,
    jwt.uid,
    jwt.id,
    jwt.account_id,
  );
  const name = firstString(
    jwt.nickname,
    jwt.name,
    jwt.preferred_username,
    jwt.username,
  );
  if (!email && !accountId && !name) return null;
  return { email, accountId, name };
}

/** 登录完成后拉取用户信息（对齐 antigravity fetchUserInfo / claude JWT）。 */
export async function fetchUserInfo(
  token: string,
  region: MinimaxRegion,
): Promise<MinimaxIdentity> {
  for (const url of userInfoUrls(region)) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: minimaxRequestHeaders(token),
        timeout: 15,
        debugLabel:
          region === "intl" ? "MinimaxUserInfoIntl" : "MinimaxUserInfoCn",
      });
      if (response.status === 401 || response.status === 403) continue;
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.trim() || text.trim().startsWith("<")) continue;
      const identity = parseIdentityPayload(JSON.parse(text));
      if (identity) return identity;
    } catch {
      /* try next endpoint */
    }
  }
  return (
    identityFromJwt(token) || { email: null, accountId: null, name: null }
  );
}

async function probeRegionPayload(
  apiKey: string,
  region: MinimaxRegion,
): Promise<unknown> {
  for (const url of quotaUrls(region)) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: minimaxRequestHeaders(apiKey),
        timeout: 15,
        debugLabel: region === "intl" ? "MinimaxProbeIntl" : "MinimaxProbeCn",
      });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) continue;
      const text = await response.text();
      if (text.trim().startsWith("<")) continue;
      return JSON.parse(text);
    } catch {
      /* try next regional endpoint */
    }
  }
  return null;
}

export async function completeMinimaxLogin(input?: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 MiniMax 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("授权会话已超过 15 分钟，请重新开始");
  }
  if (!input || !input.trim())
    throw new Error("请粘贴从所选站点控制台复制的 Subscription Key");
  try {
    const apiKey = normalizeApiKey(input);
    const region = await chooseMinimaxRegion(pending.region, (candidate) =>
      probeRegionPayload(apiKey, candidate),
    );
    if (!region)
      throw new Error(
        "Subscription Key 无效，或所选站点与备用站点均无可用额度",
      );

    const masked = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
    const fallbackName = `MiniMax ${regionDisplayName(region)} ${masked}`;
    const identity = await fetchUserInfo(apiKey, region);
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: apiKey,
      region,
      name: identity.name || identity.email || fallbackName,
      email: identity.email,
      accountId: identity.accountId || masked,
    });
    if (!saved)
      throw new Error("Subscription Key 已验证，但本机 Keychain 保存失败");
    clearPending();
  } catch (error) {
    clearPending();
    throw error;
  }
}

export async function refreshOAuthToken(
  profileId: string,
  _force = false,
): Promise<string | null> {
  return getProfileAccessToken(profileId);
}

export function resolveRegion(profileId: string): MinimaxRegion {
  return getProfileRegion(profileId) || "intl";
}
