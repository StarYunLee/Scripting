import { getProvider } from "../providers/registry";
import type { ProviderAccount } from "../providers/contracts";
import { PROVIDER_IDS, type ProviderId, type UsageCard } from "../models";

type WidgetCardExtras = {
  refreshing?: boolean;
  errorMessage?: string;
  source?: UsageCard["source"];
};

/**
 * Widget-safe account snapshot builder.
 *
 * Keep this module free of App refresh/auth/UI services. A widget can render
 * cached account data without pulling the App refresh pipeline into its
 * bundle or accidentally starting a network refresh during timeline building.
 */
export function buildWidgetCard(
  provider: ProviderId,
  account: ProviderAccount,
  extras?: WidgetCardExtras,
): UsageCard {
  const api = getProvider(provider);
  const authorized = Boolean(api.token(account.id));
  const cache = authorized ? api.usage.cache(account.id) : null;
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

/** Read authorized accounts and their local usage snapshots only. */
export function listAuthorizedWidgetCards(): UsageCard[] {
  const cards: UsageCard[] = [];
  for (const provider of PROVIDER_IDS) {
    const api = getProvider(provider);
    const authorized = (api.list() as ProviderAccount[])
      .filter((account) => api.token(account.id))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const account of authorized) {
      cards.push(buildWidgetCard(provider, account));
    }
  }
  return cards;
}
