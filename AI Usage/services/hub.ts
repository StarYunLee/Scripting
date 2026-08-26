import { getProviderUsage as getProvider } from "../providers/registry-usage";
import type { ProviderAccount } from "../providers/contracts";
import { listDemoCards, refreshDemoCard } from "./demo";
import { isDemoAccountId, isDemoMode } from "./demo-flags";
import { refreshAccount } from "./refresh";
import { PROVIDER_IDS, type ProviderId, type UsageCard } from "../models";
import { applyDashboardPrefs } from "./dashboard-prefs";

type AccountLike = ProviderAccount;

export function ensureAllMigrations(): void {
  for (const id of PROVIDER_IDS) getProvider(id).ensure();
}


export function accountTitle(account: {
  id: string;
  name: string;
  email: string | null;
}): string {
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
