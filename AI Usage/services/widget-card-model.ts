import type { ProviderAccount } from "../providers/contracts";
import type { ProviderId, UsageCard } from "../models";
import type { NormalizedUsageSnapshot } from "./usage-model";

export type WidgetCardExtras = {
  refreshing?: boolean;
  errorMessage?: string;
  source?: UsageCard["source"];
};

export type WidgetCardProvider = {
  list(): ProviderAccount[];
  token(profileId: string): string | null;
  cache(profileId: string): NormalizedUsageSnapshot | null;
};

export function buildWidgetCardFromProvider(
  provider: ProviderId,
  api: WidgetCardProvider,
  account: ProviderAccount,
  extras?: WidgetCardExtras,
): UsageCard {
  const authorized = Boolean(api.token(account.id));
  const cache = authorized ? api.cache(account.id) : null;
  return {
    key: `${provider}:${account.id}`,
    provider,
    accountId: account.id,
    title: account.email || account.name,
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

export function listAuthorizedWidgetCardsFromProviders(
  providers: readonly ProviderId[],
  resolveProvider: (provider: ProviderId) => WidgetCardProvider,
): UsageCard[] {
  const cards: UsageCard[] = [];
  for (const provider of providers) {
    const api = resolveProvider(provider);
    const authorized = api
      .list()
      .filter((account) => api.token(account.id))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const account of authorized) {
      cards.push(buildWidgetCardFromProvider(provider, api, account));
    }
  }
  return cards;
}
