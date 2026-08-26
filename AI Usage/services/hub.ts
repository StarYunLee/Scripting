import { getProvider } from "../providers/registry";
import type { ProviderAccount } from "../providers/contracts";
import {
  isDemoAccountId,
  isDemoMode,
  listDemoCards,
  refreshDemoCard,
} from "./demo";
import { writeLog } from "./logger";
import { refreshAccount } from "./refresh";
import { PROVIDER_IDS, type ProviderId, type UsageCard } from "../models";
import { applyDashboardPrefs } from "./dashboard-prefs";

type AccountLike = ProviderAccount;

export function ensureAllMigrations(): void {
  for (const id of PROVIDER_IDS) getProvider(id).ensure();
}

export function findPendingAuth(): {
  provider: ProviderId;
  profileId: string;
} | null {
  for (const id of PROVIDER_IDS) {
    const api = getProvider(id);
    if (!api.auth.hasPending()) continue;
    const profileId = api.auth.pendingId();
    if (profileId) return { provider: id, profileId };
  }
  return null;
}

function accountTitle(account: AccountLike): string {
  if (account.email && account.email.includes("@")) return account.email;
  const name = String(account.name || "").trim();
  if (name && name !== account.id && !/^acct_/i.test(name)) return name;
  return "未命名账号";
}

export function buildCard(
  provider: ProviderId,
  account: AccountLike,
  extras?: {
    refreshing?: boolean;
    errorMessage?: string;
    source?: UsageCard["source"];
  },
): UsageCard {
  const api = getProvider(provider);
  const authorized = Boolean(api.token(account.id));
  const cache = authorized ? api.usage.cache(account.id) : null;
  return {
    key: `${provider}:${account.id}`,
    provider,
    accountId: account.id,
    title: accountTitle(account),
    planLabel: cache?.planLabel || null,
    authorized,
    windows: cache?.windows || [],
    resetCredits: cache?.resetCredits || null,
    fetchedAt: cache?.fetchedAt || null,
    source: extras?.errorMessage
      ? "error"
      : extras?.source || cache?.source || "empty",
    errorMessage: extras?.errorMessage,
    refreshing: Boolean(extras?.refreshing),
  };
}

export function listAuthorizedCards(): UsageCard[] {
  return applyDashboardPrefs(listAllAuthorizedCards());
}

/** 未应用总览偏好的完整账号卡片（设置页选条目用）。 */
export function listAllAuthorizedCards(): UsageCard[] {
  if (isDemoMode()) return listDemoCards();
  const cards: UsageCard[] = [];
  for (const provider of PROVIDER_IDS) {
    const api = getProvider(provider);
    const accounts = api.list() as AccountLike[];
    const authorized = accounts.filter((account) => api.token(account.id));
    authorized.sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)),
    );
    for (const account of authorized) cards.push(buildCard(provider, account));
  }
  return cards;
}

export async function beginProviderAuth(
  provider: ProviderId,
  profileId?: string,
): Promise<{ profileId: string; url: string }> {
  if (isDemoMode()) throw new Error("演示模式不会发起真实授权");
  const api = getProvider(provider);
  const account = profileId ? { id: profileId } : api.create();
  try {
    const url = await api.auth.start(account.id);
    writeLog({
      level: "info",
      source: "app",
      category: "auth",
      event: "auth.started",
      provider,
      accountId: account.id,
      message: "授权流程已开始",
    });
    return { profileId: account.id, url };
  } catch (error) {
    writeLog({
      level: "error",
      source: "app",
      category: "auth",
      event: "auth.start_failed",
      provider,
      accountId: account.id,
      message: "启动授权失败",
      code: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

export async function completeProviderAuth(
  provider: ProviderId,
  input: string,
): Promise<void> {
  if (isDemoMode()) throw new Error("演示模式不会完成真实授权");
  try {
    await getProvider(provider).auth.complete(input);
    writeLog({
      level: "info",
      source: "app",
      category: "auth",
      event: "auth.succeeded",
      provider,
      message: "授权成功",
    });
  } catch (error) {
    writeLog({
      level: "error",
      source: "app",
      category: "auth",
      event: "auth.failed",
      provider,
      message: "授权失败",
      code: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

export function cancelProviderAuth(
  provider: ProviderId,
  profileId: string,
): void {
  const api = getProvider(provider);
  api.auth.clearPending();
  if (!api.token(profileId)) {
    api.usage.clearCache(profileId);
    api.clearSettings(profileId);
    api.remove(profileId);
  }
}

export async function refreshCard(
  provider: ProviderId,
  profileId: string,
  force = true,
): Promise<UsageCard> {
  if (isDemoMode() || isDemoAccountId(profileId))
    return refreshDemoCard(profileId);
  const outcome = await refreshAccount(
    { provider, profileId },
    { force, source: "app" },
  );
  if (!outcome.ok) {
    const account = getProvider(provider)
      .list()
      .find((item) => item.id === profileId);
    if (!account) throw new Error(outcome.error?.message || "账号不存在");
    return buildCard(provider, account, {
      errorMessage: outcome.error?.message,
    });
  }
  const account = getProvider(provider)
    .list()
    .find((item) => item.id === profileId);
  if (!account) throw new Error("账号不存在");
  return buildCard(provider, account, {
    source: outcome.source || "live",
  });
}

export function deleteAuthorizedAccount(
  provider: ProviderId,
  profileId: string,
): void {
  const api = getProvider(provider);
  api.usage.clearCache(profileId);
  api.clearSettings(profileId);
  api.remove(profileId);
}

export function listProviderAccounts(provider: ProviderId): AccountLike[] {
  return getProvider(provider).list() as AccountLike[];
}

export function isAuthorized(provider: ProviderId, profileId: string): boolean {
  return Boolean(getProvider(provider).token(profileId));
}
