import { getSnapshotProvider } from "../providers/snapshot-registry";
import type { ProviderAccount } from "../providers/contracts";
import { PROVIDER_IDS, type ProviderId, type UsageCard } from "../models";
import {
  buildWidgetCardFromProvider,
  listAuthorizedWidgetCardsFromProviders,
  type WidgetCardExtras,
} from "./widget-card-model";

export {
  buildWidgetCardFromProvider,
  listAuthorizedWidgetCardsFromProviders,
} from "./widget-card-model";

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
  return buildWidgetCardFromProvider(
    provider,
    getSnapshotProvider(provider),
    account,
    extras,
  );
}

/** Read authorized accounts and their local usage snapshots only. */
export function listAuthorizedWidgetCards(): UsageCard[] {
  return listAuthorizedWidgetCardsFromProviders(
    PROVIDER_IDS,
    getSnapshotProvider,
  );
}
