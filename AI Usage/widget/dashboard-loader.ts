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
  type DashboardReloadPolicy,
} from "../services/dashboard-widget-loader-core";
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
  const kind = parseWidgetFamily(input.family);
  const raw =
    input.dataSource === "demo" ? listDemoCards() : listAuthorizedWidgetCards();
  const selected = applyDashboardWidgetPreferences(raw, preferences);
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
  // Dashboard 小组件切为纯本地快照模式（Zero-Network）：
  // 保留全量可用卡片传递给视图，以便准确计算各尺寸的 hiddenAccountCount（“另有 x 个账号”）；
  // 0ms 响应，改配置与样式秒级刷新；数据更新收口至 App 前台与桌面手动刷新按钮。
  return {
    cards: selected,
    hasErrors: selected.some((card) => card.source === "error"),
    display: preferences.display,
    reloadPolicy: fallbackReloadPolicy(input.reloadMinutes),
  };
}
