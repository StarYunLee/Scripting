import { buildCard, listAllAuthorizedCards } from "../services/hub";
import {
  applyDashboardPrefs,
  getDashboardPrefs,
} from "../services/dashboard-prefs";
import { isDemoAccountId, isDemoMode, refreshDemoCard } from "../services/demo";
import { refreshAccount } from "../services/refresh";
import { getProvider } from "../providers/registry";
import type { UsageCard } from "../models";

export type DashboardWidgetData = {
  cards: UsageCard[];
  hasErrors: boolean;
};

async function refreshCardForWidget(card: UsageCard): Promise<UsageCard> {
  if (isDemoMode() || isDemoAccountId(card.accountId)) {
    return refreshDemoCard(card.accountId);
  }

  const outcome = await refreshAccount(
    { provider: card.provider, profileId: card.accountId },
    { force: false, source: "app" },
  );
  const account = getProvider(card.provider)
    .list()
    .find((item) => item.id === card.accountId);
  if (!account) return card;
  if (!outcome.ok) {
    return buildCard(card.provider, account, {
      errorMessage: outcome.error?.message,
    });
  }
  return buildCard(card.provider, account, {
    source: outcome.source || "live",
  });
}

export async function loadDashboardWidgetUsage(): Promise<DashboardWidgetData> {
  const prefs = getDashboardPrefs("widget");
  const selected = applyDashboardPrefs(listAllAuthorizedCards(), prefs);
  let hasErrors = false;
  const cards: UsageCard[] = [];

  for (const card of selected) {
    try {
      const next = await refreshCardForWidget(card);
      if (next.errorMessage) hasErrors = true;
      cards.push(next);
    } catch {
      hasErrors = true;
      cards.push(card);
    }
  }

  return {
    cards: applyDashboardPrefs(cards, prefs),
    hasErrors,
  };
}
