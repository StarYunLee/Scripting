import { countUsageOperation } from "./performance-counters";
import type { ProviderAccount } from "../providers/contracts";
import type { ProviderId, UsageCard } from "../models";
import type { NormalizedUsageSnapshot } from "./usage-model";

export type WidgetCardExtras = {
  refreshing?: boolean;
  errorMessage?: string;
  source?: UsageCard["source"];
  snapshot?: NormalizedUsageSnapshot;
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
  knownAuthorized?: boolean,
): UsageCard {
  if (knownAuthorized === undefined) countUsageOperation("authorizationReads");
  const authorized = knownAuthorized ?? Boolean(api.token(account.id));
  if (authorized && !extras?.snapshot) countUsageOperation("snapshotReads");
  const cache = authorized ? (extras?.snapshot ?? api.cache(account.id)) : null;
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
  select?: (accounts: UsageCard[]) => UsageCard[],
): UsageCard[] {
  countUsageOperation("cardLists");
  const summaries: UsageCard[] = [];
  const accountsByKey = new Map<
    string,
    { api: WidgetCardProvider; account: ProviderAccount }
  >();
  for (const provider of providers) {
    const api = resolveProvider(provider);
    const authorized = api
      .list()
      .filter((account) => {
        countUsageOperation("authorizationReads");
        return Boolean(api.token(account.id));
      })
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const account of authorized) {
      const key = `${provider}:${account.id}`;
      accountsByKey.set(key, { api, account });
      summaries.push({
        key,
        provider,
        accountId: account.id,
        title: account.email || account.name,
        planLabel: null,
        authorized: true,
        windows: [],
        resetCredits: null,
        fetchedAt: null,
        source: "empty",
        refreshing: false,
      });
    }
  }
  return (select ? select(summaries) : summaries).map((summary) => {
    const entry = accountsByKey.get(summary.key)!;
    return buildWidgetCardFromProvider(
      summary.provider,
      entry.api,
      entry.account,
      undefined,
      true,
    );
  });
}
