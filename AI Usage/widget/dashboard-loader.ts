import type { UsageCard } from "../models";
import { isDemoMode, listDemoCards } from "../services/demo";
import {
  applyDashboardWidgetPreferences,
  getDashboardWidgetPreferences,
} from "../services/dashboard-widget-prefs";
import { listAuthorizedWidgetCards } from "../services/widget-cards";

export type DashboardWidgetData = {
  cards: UsageCard[];
  hasErrors: boolean;
  display: ReturnType<typeof getDashboardWidgetPreferences>["display"];
};

export async function loadDashboardWidgetUsage(): Promise<DashboardWidgetData> {
  const preferences = getDashboardWidgetPreferences();
  const allCards = isDemoMode() ? listDemoCards() : listAuthorizedWidgetCards();
  const selected = applyDashboardWidgetPreferences(allCards, preferences);
  return {
    cards: selected,
    hasErrors: selected.some((card) => card.source === "error"),
    display: preferences.display,
  };
}
