import { buildCard, listAllAuthorizedCards } from "../services/hub";
import {
  applyDashboardPrefs,
  getDashboardPrefs,
} from "../services/dashboard-prefs";
import { isDemoMode, refreshDemoCard } from "../services/demo";
import {
  mergeDashboardRefreshOutcomes,
  type DashboardRefreshResult,
} from "../services/dashboard-widget-refresh";
import { refreshAccounts } from "../services/refresh";
import { getProvider } from "../providers/registry";
import type { UsageCard } from "../models";

export type DashboardWidgetData = DashboardRefreshResult;

function rebuildCard(
  card: UsageCard,
  outcome: { ok: true; source?: "live" | "cache" },
): UsageCard | null {
  const account = getProvider(card.provider)
    .list()
    .find((item) => item.id === card.accountId);
  return account
    ? buildCard(card.provider, account, {
        source: outcome.source || "live",
      })
    : null;
}

export async function loadDashboardWidgetUsage(): Promise<DashboardWidgetData> {
  const prefs = getDashboardPrefs("widget");
  const selected = applyDashboardPrefs(listAllAuthorizedCards(), prefs);
  if (!selected.length) return { cards: [], hasErrors: false };

  if (isDemoMode()) {
    return {
      cards: applyDashboardPrefs(
        selected.map((card) => refreshDemoCard(card.accountId)),
        prefs,
      ),
      hasErrors: false,
    };
  }

  const summary = await refreshAccounts(
    selected.map((card) => ({
      provider: card.provider,
      profileId: card.accountId,
    })),
    { force: false, source: "widget" },
  );
  const merged = mergeDashboardRefreshOutcomes(
    selected,
    summary.outcomes,
    rebuildCard,
  );
  return {
    cards: applyDashboardPrefs(merged.cards, prefs),
    hasErrors: merged.hasErrors,
  };
}
