import { buildCard, listAllAuthorizedCards } from "../services/hub";
import {
  applyDashboardPrefs,
  getDashboardPrefs,
} from "../services/dashboard-prefs";
import { refreshDemoCard } from "../services/demo";
import { isDemoAccountId, isDemoMode } from "../services/demo-flags";
import { inBatches, refreshAccount } from "../services/refresh";
import { getProviderUsage as getProvider } from "../providers/registry-usage";
import type { UsageCard } from "../models";

export type DashboardWidgetData = {
  cards: UsageCard[];
  hasErrors: boolean;
};

/** 总览小组件的缓存新鲜度：10 分钟内直接复用缓存，避免每次渲染都全量打网络。 */
const WIDGET_CACHE_FRESH_MS = 10 * 60_000;

async function refreshCardForWidget(card: UsageCard): Promise<UsageCard> {
  if (isDemoMode() || isDemoAccountId(card.accountId)) {
    return refreshDemoCard(card.accountId);
  }

  // 缓存新鲜时直接复用（card 本身就是从缓存构建的），不发起网络请求
  const cached = getProvider(card.provider).usage.cache(card.accountId);
  if (cached?.fetchedAt) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (Number.isFinite(age) && age < WIDGET_CACHE_FRESH_MS) return card;
  }

  const outcome = await refreshAccount(
    { provider: card.provider, profileId: card.accountId },
    { force: false, source: "widget" },
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

  // 小组件有 30MB 内存上限，并发批取 2：同时持有的响应体最少
  const cards = await inBatches(selected, 2, async (card) => {
    try {
      const next = await refreshCardForWidget(card);
      if (next.errorMessage) hasErrors = true;
      return next;
    } catch {
      hasErrors = true;
      return card;
    }
  });

  return {
    cards: applyDashboardPrefs(cards, prefs),
    hasErrors,
  };
}
