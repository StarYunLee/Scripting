import { dashboardAccountLabels } from "./account-labels";
import type { UsageCard } from "../../models";

export type DashboardAccount = {
  key: string;
  provider: UsageCard["provider"];
  accountId: string;
  accountTitle: string;
  planLabel: string | null;
  fetchedAt: string | null;
  windows: UsageCard["windows"];
  source: UsageCard["source"];
};

export type DashboardFamily = "small" | "medium" | "large" | "extraLargePortrait";

export type DashboardPlan = {
  accounts: DashboardAccount[];
  hiddenAccountCount: number;
  columns: 1 | 2;
  rows: number;
  family: DashboardFamily;
};

export function buildDashboardAccounts(
  cards: UsageCard[],
  labelAccounts: UsageCard[] = cards,
): DashboardAccount[] {
  const labels = dashboardAccountLabels(labelAccounts);
  return cards
    .filter((card) => card.windows.length > 0)
    .map((card) => ({
      key: card.key,
      provider: card.provider,
      accountId: card.accountId,
      accountTitle: labels[card.key] ?? dashboardAccountLabels([card])[card.key],
      planLabel: card.planLabel,
      fetchedAt: card.fetchedAt,
      windows: card.windows.slice(0, 2),
      source: card.source,
    }));
}

export function dashboardAccountCap(family: DashboardFamily): number {
  if (family === "small") return 2;
  if (family === "medium") return 4;
  if (family === "extraLargePortrait") return 12;
  return 8;
}

export function planDashboard(
  cards: UsageCard[],
  family: DashboardFamily,
  labelAccounts: UsageCard[] = cards,
): DashboardPlan {
  const all = buildDashboardAccounts(cards, labelAccounts);
  const accounts = all.slice(0, dashboardAccountCap(family));
  const columns: 1 | 2 = family === "extraLargePortrait" ? 2
    : family === "small" || accounts.length <= 1 ? 1 : 2;
  return {
    accounts,
    hiddenAccountCount: Math.max(0, all.length - accounts.length),
    columns,
    rows: Math.max(1, Math.ceil(accounts.length / columns)),
    family,
  };
}
