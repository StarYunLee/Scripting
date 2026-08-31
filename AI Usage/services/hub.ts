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
import {
  PROVIDER_IDS,
  type ProviderId,
  type UsageCard,
  type UsageWindowView,
} from "../models";
import { clearAccountOverviewPreferences } from "./app-overview-prefs";
import { clearAccountWidgetPreferences } from "./widget-prefs";
import { clearDashboardWidgetAccountPreferences } from "./dashboard-widget-prefs";
import { createAuthCoordinator } from "./auth-coordinator";
import { openAuthorizationPage } from "./browser";
import { getPendingAuthorizationState } from "../providers/copilot/oauth";
import { clearWidgetRefreshMetadata } from "./widget-refresh-metadata";
import { deleteAccountData } from "./account-deletion";
import {
  buildWidgetCard as buildCard,
  listAuthorizedWidgetCards,
} from "./widget-cards";

type AccountLike = ProviderAccount;

export function ensureAllMigrations(): void {
  for (const id of PROVIDER_IDS) getProvider(id).ensure();
}

export const authCoordinator = createAuthCoordinator({
  providerIds: PROVIDER_IDS,
  getProvider,
  isDemoMode,
  openAuthorizationPage,
  getCopilotAuthorizationState: getPendingAuthorizationState,
  writeLog,
});

export { buildCard };

export function listAuthorizedCards(): ReturnType<
  typeof listAuthorizedWidgetCards
> {
  return isDemoMode() ? listDemoCards() : listAuthorizedWidgetCards();
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
): ReturnType<typeof deleteAccountData> {
  const api = getProvider(provider);
  return deleteAccountData({
    remove: () => api.remove(profileId),
    clearCache: () => api.usage.clearCache(profileId),
    clearProviderSettings: () => {
      api.clearSettings(profileId);
    },
    clearOverviewPreferences: () =>
      clearAccountOverviewPreferences(provider, profileId),
    clearWidgetPreferences: () =>
      clearAccountWidgetPreferences(provider, profileId),
    clearDashboardPreferences: () =>
      clearDashboardWidgetAccountPreferences(`${provider}:${profileId}`),
    clearRefreshMetadata: () => clearWidgetRefreshMetadata(provider, profileId),
  });
}

export function cachedUsageWindows(
  provider: ProviderId,
  profileId: string,
): UsageWindowView[] {
  if (isDemoAccountId(profileId) || isDemoMode()) {
    const demoCard = listDemoCards().find(
      (c) => c.provider === provider && c.accountId === profileId,
    );
    if (demoCard) return demoCard.windows;
  }
  return getProvider(provider).usage.cache(profileId)?.windows || [];
}

export function listProviderAccounts(provider: ProviderId): AccountLike[] {
  return getProvider(provider).list() as AccountLike[];
}

export function isAuthorized(provider: ProviderId, profileId: string): boolean {
  return Boolean(getProvider(provider).token(profileId));
}

export function cachedPlanLabel(
  provider: ProviderId,
  profileId: string,
): string | null {
  return getProvider(provider).usage.cache(profileId)?.planLabel || null;
}
