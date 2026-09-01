import type { UsageCard } from "../models";
import type { NormalizedUsageSnapshot } from "./usage-model";
import type { WidgetRefreshMetadata } from "./widget-refresh-metadata";
import {
  planDashboardWidgetRefresh,
  type DashboardWidgetRefreshAccountPlan,
} from "./dashboard-widget-refresh-planner";
import type { LoadedWidgetSnapshot } from "./widget-account-loader-core";
import type { WidgetReloadPolicy } from "./widget-refresh-planner";
import { widgetRefreshStatusText } from "./widget-refresh-planner";
import { parseWidgetFamily } from "../widget/family";
import { dashboardAccountCap } from "../widget/dashboard/model";

export type DashboardReloadPolicy = WidgetReloadPolicy;

export function mergeDashboardSnapshot(
  card: UsageCard,
  snapshot: NormalizedUsageSnapshot,
): UsageCard {
  return {
    key: card.key,
    provider: card.provider,
    accountId: card.accountId,
    title: card.title,
    authorized: card.authorized,
    refreshing: card.refreshing,
    planLabel: snapshot.planLabel,
    windows: snapshot.windows,
    resetCredits: snapshot.resetCredits,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
}

type DashboardLoadedAccount = Pick<
  LoadedWidgetSnapshot,
  "snapshot" | "metadata" | "statusText" | "errorMessage"
>;

export type DashboardRefreshResult = {
  cards: UsageCard[];
  candidateKey: string | null;
  pendingCount: number;
  reloadPolicy: DashboardReloadPolicy;
};

function errorCard(card: UsageCard, message: string): UsageCard {
  return {
    ...card,
    source: "error",
    errorMessage: message,
    refreshStatus: "failure",
  };
}

export function dashboardWidgetCandidateCards(
  cards: UsageCard[],
  family: string,
): UsageCard[] {
  const kind = parseWidgetFamily(family);
  return kind ? cards.slice(0, dashboardAccountCap(kind)) : [];
}

export async function executeDashboardWidgetRefresh(input: {
  cards: UsageCard[];
  reloadMinutes: number;
  now: number;
  readMetadata(
    provider: UsageCard["provider"],
    accountId: string,
  ): WidgetRefreshMetadata;
  loadAccount(input: {
    provider: UsageCard["provider"];
    profileId: string;
    reloadMinutes: number;
  }): Promise<DashboardLoadedAccount>;
}): Promise<DashboardRefreshResult> {
  const metadataByKey = new Map<string, WidgetRefreshMetadata>();
  const planningAccounts = input.cards.map((card) => {
    const metadata = input.readMetadata(card.provider, card.accountId);
    metadataByKey.set(card.key, metadata);
    return {
      key: card.key,
      provider: card.provider,
      profileId: card.accountId,
      fetchedAt: card.fetchedAt,
      metadata,
    };
  });
  const initial = planDashboardWidgetRefresh({
    accounts: planningAccounts,
    reloadMinutes: input.reloadMinutes,
    now: input.now,
  });

  const cards = input.cards.slice();
  for (const card of cards) {
    const metadata = metadataByKey.get(card.key);
    if (!metadata) {
      throw new Error(`缺少 Dashboard 刷新元数据：${card.key}`);
    }
    const nextAttemptAt = metadata.nextAutomaticAttemptAt
      ? new Date(metadata.nextAutomaticAttemptAt).getTime()
      : NaN;
    const hasActiveFailure =
      metadata.lastErrorCode === "unauthorized" ||
      (Boolean(metadata.lastErrorCode) &&
        Boolean(metadata.lastFailureAt) &&
        Number.isFinite(nextAttemptAt) &&
        nextAttemptAt > input.now);
    if (!hasActiveFailure) continue;
    const planned = initial.accounts.find(
      (account) => account.key === card.key,
    );
    if (planned?.plan.action !== "use_cache") continue;
    const message = widgetRefreshStatusText({
      fetchedAt: card.fetchedAt,
      metadata,
      now: input.now,
    });
    if (!message) continue;
    const index = cards.findIndex((item) => item.key === card.key);
    if (index >= 0) cards[index] = errorCard(cards[index], message);
  }

  const candidate: DashboardWidgetRefreshAccountPlan | null = initial.candidate;
  let loaded: DashboardLoadedAccount | null = null;
  if (candidate) {
    loaded = await input.loadAccount({
      provider: candidate.provider,
      profileId: candidate.profileId,
      reloadMinutes: input.reloadMinutes,
    });
    const index = cards.findIndex((card) => card.key === candidate.key);
    if (index >= 0) {
      const previous = cards[index];
      if (loaded.errorMessage) {
        cards[index] = errorCard(previous, loaded.errorMessage);
      } else if (loaded.snapshot) {
        cards[index] = mergeDashboardSnapshot(previous, loaded.snapshot);
      } else if (loaded.statusText) {
        cards[index] = errorCard(previous, loaded.statusText);
      }
    }
  }

  const finalAccounts = cards.map((card) => {
    const initialMetadata = metadataByKey.get(card.key);
    if (!initialMetadata) {
      throw new Error(`缺少 Dashboard 刷新元数据：${card.key}`);
    }
    return {
      key: card.key,
      provider: card.provider,
      profileId: card.accountId,
      fetchedAt: card.fetchedAt,
      metadata:
        card.key === candidate?.key && loaded
          ? loaded.metadata
          : initialMetadata,
    };
  });
  const finalPlan = planDashboardWidgetRefresh({
    accounts: finalAccounts,
    reloadMinutes: input.reloadMinutes,
    now: input.now,
  });
  const reloadPolicy: DashboardReloadPolicy =
    finalPlan.pendingCount > 0
      ? { policy: "after", date: new Date(input.now + 2 * 60_000) }
      : finalPlan.nextFutureReloadAt
        ? {
            policy: "after",
            date: new Date(finalPlan.nextFutureReloadAt),
          }
        : { policy: "never" };

  return {
    cards,
    candidateKey: candidate?.key || null,
    pendingCount: finalPlan.pendingCount,
    reloadPolicy,
  };
}
