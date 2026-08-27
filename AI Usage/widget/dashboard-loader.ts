import { buildCard, listAllAuthorizedCards } from "../services/hub";
import {
  applyDashboardPrefs,
  getDashboardPrefs,
} from "../services/dashboard-prefs";
import { refreshDemoCard } from "../services/demo";
import { isDemoAccountId, isDemoMode } from "../services/demo-flags";
import { inBatches, refreshAccount } from "../services/refresh";
import { getProviderUsage as getProvider } from "../providers/registry-usage";
import { writeLog } from "../services/logger";
import type { UsageCard } from "../models";

export type DashboardWidgetData = {
  cards: UsageCard[];
  hasErrors: boolean;
};

/** 总览小组件的缓存新鲜度：10 分钟内直接复用缓存，避免每次渲染都全量打网络。 */
const WIDGET_CACHE_FRESH_MS = 10 * 60_000;
/** 预算只阻止后续请求；Scripting fetch 无可移植 AbortSignal，已开始的请求仍由各 Provider timeout 收口。 */
const WIDGET_REFRESH_BUDGET_MS = 20_000;

async function refreshCardForWidget(
  card: UsageCard,
  deadlineMs: number,
): Promise<UsageCard> {
  if (isDemoMode() || isDemoAccountId(card.accountId)) {
    return refreshDemoCard(card.accountId);
  }

  // card 已经由同一缓存快照构建，不再二次读取 Storage。
  if (card.fetchedAt) {
    const age = Date.now() - new Date(card.fetchedAt).getTime();
    if (Number.isFinite(age) && age < WIDGET_CACHE_FRESH_MS) return card;
  }

  if (Date.now() >= deadlineMs) return card;
  const outcome = await refreshAccount(
    { provider: card.provider, profileId: card.accountId },
    {
      force: false,
      source: "widget",
      deadlineMs,
      logSuccess: false,
    },
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
  const deadlineMs = Date.now() + WIDGET_REFRESH_BUDGET_MS;
  let hasErrors = false;

  // 小组件有 30MB 内存上限，并发批取 2：同时持有的响应体最少
  const cards = await inBatches(selected, 2, async (card) => {
    try {
      const next = await refreshCardForWidget(card, deadlineMs);
      if (next.errorMessage) hasErrors = true;
      return next;
    } catch {
      hasErrors = true;
      return card;
    }
  });

  const liveCount = cards.filter((card) => card.source === "live").length;
  if (liveCount > 0) {
    writeLog({
      level: hasErrors ? "warning" : "info",
      source: "widget",
      category: "widget",
      event: "widget.refresh_summary",
      message: `多账号用量刷新 ${liveCount}/${cards.length} 个账号`,
    });
  }
  return {
    cards: applyDashboardPrefs(cards, prefs),
    hasErrors,
  };
}
