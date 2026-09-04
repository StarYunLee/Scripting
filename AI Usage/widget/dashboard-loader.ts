import type { UsageCard } from "../models";
import { listDemoCards } from "../services/demo";
import {
  applyDashboardWidgetPreferences,
  readDashboardWidgetPreferences,
} from "../services/dashboard-widget-prefs";
import { listAuthorizedWidgetCards } from "../services/widget-cards";
import { parseWidgetFamily } from "./family";
import type { WidgetDataSource } from "./parameter";
import {
  dashboardWidgetCandidateCards as dashboardWidgetCandidateCardsCore,
  executeDashboardWidgetRefresh,
  type DashboardReloadPolicy,
} from "../services/dashboard-widget-loader-core";
import { getWidgetRefreshMetadata } from "../services/widget-refresh-metadata";
import { loadWidgetAccountSnapshot } from "../services/widget-account-loader";
import { resolveWidgetReloadPolicy } from "../services/widget-refresh-planner";

export type DashboardWidgetData = {
  cards: UsageCard[];
  hasErrors: boolean;
  display: ReturnType<typeof readDashboardWidgetPreferences>["display"];
  reloadPolicy: DashboardReloadPolicy;
};

export const dashboardWidgetCandidateCards = dashboardWidgetCandidateCardsCore;

function emptyMetadata() {
  return {
    version: 1 as const,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failureCount: 0,
    nextAutomaticAttemptAt: null,
    lastErrorCode: null,
    lastHttpStatus: null,
  };
}

function fallbackReloadPolicy(reloadMinutes: number): DashboardReloadPolicy {
  return resolveWidgetReloadPolicy({
    snapshot: null,
    metadata: emptyMetadata(),
    reloadMinutes,
  });
}

export async function loadDashboardWidgetUsage(input: {
  family: string;
  reloadMinutes: number;
  dataSource: WidgetDataSource;
}): Promise<DashboardWidgetData> {
  const preferences = readDashboardWidgetPreferences(input.dataSource);
  const raw =
    input.dataSource === "demo" ? listDemoCards() : listAuthorizedWidgetCards();
  const selected = applyDashboardWidgetPreferences(raw, preferences);
  const kind = parseWidgetFamily(input.family);
  if (input.dataSource === "demo") {
    return {
      cards: selected,
      hasErrors: selected.some((card) => card.source === "error"),
      display: preferences.display,
      reloadPolicy: fallbackReloadPolicy(input.reloadMinutes),
    };
  }
  if (!kind) {
    return {
      cards: selected,
      hasErrors: selected.some((card) => card.source === "error"),
      display: preferences.display,
      reloadPolicy: { policy: "never" },
    };
  }
  const candidates = dashboardWidgetCandidateCards(selected, input.family);
  const result = await executeDashboardWidgetRefresh({
    cards: candidates,
    reloadMinutes: input.reloadMinutes,
    now: Date.now(),
    readMetadata: getWidgetRefreshMetadata,
    loadAccount: loadWidgetAccountSnapshot,
  });
  const refreshedByKey = new Map(result.cards.map((card) => [card.key, card]));
  const mergedRaw = raw.map((card) => refreshedByKey.get(card.key) || card);
  const finalSelected = applyDashboardWidgetPreferences(mergedRaw, preferences);
  return {
    cards: finalSelected,
    hasErrors: finalSelected.some((card) => card.source === "error"),
    display: preferences.display,
    reloadPolicy: result.reloadPolicy,
  };
}
