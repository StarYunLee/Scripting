import { fetch } from "scripting";
import {
  getProfileAccessToken,
  getProfileRegion,
  saveProfileCredentials,
} from "./accounts";
import type { ZaiRegion } from "./types";

const PENDING_KEY = "ai_usage_zai_oauth_pending_v1";
const PENDING_TTL_MS = 15 * 60_000;
const CONSOLE_URL_INTL = "https://z.ai/manage-apikey/apikey-list";
const CONSOLE_URL_CN = "https://open.bigmodel.cn/usercenter/apikeys";

type PendingAuth = {
  createdAt: number;
  profileId: string;
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
    return { createdAt: value.createdAt, profileId: value.profileId };
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

export function zaiRequestHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "AI-Usage-Scripting/1.7.0",
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

/** 打开控制台获取 API Key；真正授权在 complete 时粘贴 Key。 */
export async function startZaiLogin(profileId: string): Promise<string> {
  if (!profileId) throw new Error("未指定要授权的账号");
  savePending({ createdAt: Date.now(), profileId });
  return CONSOLE_URL_INTL;
}

function normalizeApiKey(input: string): string {
  const trimmed = input.trim().replace(/^Bearer\s+/i, "");
  if (!trimmed || trimmed.length < 8)
    throw new Error("请粘贴完整的 Z.ai / 智谱 API Key");
  return trimmed;
}

async function probeRegion(
  apiKey: string,
  region: ZaiRegion,
): Promise<boolean> {
  const url =
    region === "intl"
      ? "https://api.z.ai/api/monitor/usage/quota/limit"
      : "https://bigmodel.cn/api/monitor/usage/quota/limit";
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: zaiRequestHeaders(apiKey),
      timeout: 15,
      debugLabel: region === "intl" ? "ZaiProbeIntl" : "ZaiProbeCn",
    });
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) return false;
    const text = await response.text();
    const payload = JSON.parse(text) as { success?: boolean; code?: number };
    return Boolean(payload.success) || payload.code === 200;
  } catch {
    return false;
  }
}

export async function completeZaiLogin(input?: string): Promise<void> {
  const pending = readPending();
  if (!pending) throw new Error("未找到待完成的 Z.ai 授权，请重新开始");
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    throw new Error("授权会话已超过 15 分钟，请重新开始");
  }
  if (!input || !input.trim())
    throw new Error("请粘贴从控制台复制的 API Key");
  try {
    const apiKey = normalizeApiKey(input);
    let region: ZaiRegion | null = null;
    if (await probeRegion(apiKey, "intl")) region = "intl";
    else if (await probeRegion(apiKey, "cn")) region = "cn";
    else throw new Error("API Key 无效，或国际站 / 国内站均无法访问");

    const masked = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
    const saved = saveProfileCredentials(pending.profileId, {
      accessToken: apiKey,
      region,
      name: region === "cn" ? `智谱 ${masked}` : `Z.ai ${masked}`,
      accountId: masked,
    });
    if (!saved) throw new Error("API Key 已验证，但本机 Keychain 保存失败");
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

export function resolveRegion(profileId: string): ZaiRegion {
  return getProfileRegion(profileId) || "intl";
}

export function consoleUrlForRegion(region: ZaiRegion): string {
  return region === "cn" ? CONSOLE_URL_CN : CONSOLE_URL_INTL;
}
