import type { ProviderId } from "../models";
import type { WidgetRefreshMetadata } from "./widget-refresh-metadata";
import {
  planWidgetAutomaticRefresh,
  resolveWidgetReloadPolicy,
  type WidgetRefreshPlan,
} from "./widget-refresh-planner";

export type DashboardWidgetRefreshAccount = {
  key: string;
  provider: ProviderId;
  profileId: string;
  fetchedAt: string | null;
  metadata: WidgetRefreshMetadata;
};

export type DashboardWidgetRefreshAccountPlan =
  DashboardWidgetRefreshAccount & {
    plan: WidgetRefreshPlan;
    reloadAt: string | null;
  };

export type DashboardWidgetRefreshPlanningResult = {
  accounts: DashboardWidgetRefreshAccountPlan[];
  candidate: DashboardWidgetRefreshAccountPlan | null;
  pendingCount: number;
  nextFutureReloadAt: string | null;
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableTime(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftTime = timestamp(left);
  const rightTime = timestamp(right);
  if (leftTime == null && rightTime == null) return 0;
  if (leftTime == null) return -1;
  if (rightTime == null) return 1;
  return leftTime - rightTime;
}

function compareByAttemptThenKey(
  left: DashboardWidgetRefreshAccountPlan,
  right: DashboardWidgetRefreshAccountPlan,
): number {
  return (
    compareNullableTime(
      left.metadata.lastAttemptAt,
      right.metadata.lastAttemptAt,
    ) || left.key.localeCompare(right.key)
  );
}

function compareCandidates(
  left: DashboardWidgetRefreshAccountPlan,
  right: DashboardWidgetRefreshAccountPlan,
): number {
  if (left.plan.reason === "missing_cache") {
    if (right.plan.reason !== "missing_cache") return -1;
    return compareByAttemptThenKey(left, right);
  }
  if (right.plan.reason === "missing_cache") return 1;
  const byExpiry = compareNullableTime(left.reloadAt, right.reloadAt);
  return byExpiry || compareByAttemptThenKey(left, right);
}

export function planDashboardWidgetRefresh(input: {
  accounts: DashboardWidgetRefreshAccount[];
  reloadMinutes: number;
  now?: number;
}): DashboardWidgetRefreshPlanningResult {
  const now = input.now ?? Date.now();
  const accounts = input.accounts.map((account) => {
    const plan = planWidgetAutomaticRefresh({
      fetchedAt: account.fetchedAt,
      reloadMinutes: input.reloadMinutes,
      metadata: account.metadata,
      now,
    });
    const reloadPolicy = resolveWidgetReloadPolicy({
      snapshot: { fetchedAt: account.fetchedAt },
      metadata: account.metadata,
      reloadMinutes: input.reloadMinutes,
      now,
    });
    return {
      ...account,
      plan,
      reloadAt:
        reloadPolicy.policy === "after"
          ? reloadPolicy.date.toISOString()
          : null,
    };
  });

  const fetchCandidates = accounts
    .filter((account) => account.plan.action === "fetch")
    .sort(compareCandidates);
  const futureReloads = accounts
    .filter((account) => {
      const reloadAt = timestamp(account.reloadAt);
      return (
        account.plan.action === "use_cache" &&
        account.plan.reason !== "authorization_required" &&
        reloadAt != null &&
        reloadAt > now
      );
    })
    .sort((left, right) => compareNullableTime(left.reloadAt, right.reloadAt));

  return {
    accounts,
    candidate: fetchCandidates[0] || null,
    pendingCount: fetchCandidates.length,
    nextFutureReloadAt: futureReloads[0]?.reloadAt || null,
  };
}
