/**
 * 刷新/缓存到期判定的纯策略模块：零 import、零 scripting 依赖，
 * 供 usage-cache、refresh、StatusPage 与测试共同消费。
 */

export type UsageCacheDecision = {
  useCache: boolean;
  reason: "no-cache" | "forced" | "recent" | "stale";
};

export function hasValidFetchedAt(
  fetchedAt: string | null | undefined,
): boolean {
  return Boolean(fetchedAt) && Number.isFinite(new Date(fetchedAt!).getTime());
}

export function isFreshFetchedAt(
  fetchedAt: string | null | undefined,
  now: number,
  maxAgeMs: number,
): boolean {
  if (!hasValidFetchedAt(fetchedAt)) return false;
  return now - new Date(fetchedAt!).getTime() < maxAgeMs;
}

/**
 * 纯 seam：给定 force 与缓存年龄决定「直接用缓存」还是「联网刷新」。
 * - force（手动单卡 / 全部 / Intent）永远联网；
 * - 其余调用点保留 3 分钟 recent 节流。
 * Widget 的「有缓存绝不联网」不在此判定——由 widget loader 先读缓存实现。
 */
export function decideUsageCache(input: {
  force: boolean;
  hasCache: boolean;
  fetchedAt?: string | null;
  now: number;
  recentMs: number;
}): UsageCacheDecision {
  if (!input.hasCache) return { useCache: false, reason: "no-cache" };
  if (input.force) return { useCache: false, reason: "forced" };
  if (isFreshFetchedAt(input.fetchedAt, input.now, input.recentMs))
    return { useCache: true, reason: "recent" };
  return { useCache: false, reason: "stale" };
}

/** 各 provider fetch 内的守卫：与 decideUsageCache 同一判定，供快照存在时直接短路。 */
export function shouldServeCache<TSnapshot extends { fetchedAt: string }>(
  cache: TSnapshot | null,
  options?: { force?: boolean },
  recentMs?: number,
): boolean {
  if (!cache) return false;
  const decision = decideUsageCache({
    force: Boolean(options?.force),
    hasCache: true,
    fetchedAt: cache.fetchedAt,
    now: Date.now(),
    recentMs: recentMs ?? 3 * 60_000,
  });
  return decision.useCache;
}

/**
 * 纯 seam：Dashboard 选中的卡片按「已有缓存 / 无缓存」分桶。
 * 无缓存（missing）才允许联网补刷；cached 一律不触发网络。
 * missing 判定：fetchedAt 缺失或不可解析，或卡片本就是 empty 占位。
 */
export type PartitionableCard = {
  fetchedAt: string | null;
  source?: string;
};

export function partitionDashboardCards<T extends PartitionableCard>(
  cards: T[],
): { cached: T[]; missing: T[] } {
  const cached: T[] = [];
  const missing: T[] = [];
  for (const card of cards) {
    const hasUsableCache =
      card.source !== "empty" &&
      card.source !== "error" &&
      hasValidFetchedAt(card.fetchedAt);
    (hasUsableCache ? cached : missing).push(card);
  }
  return { cached, missing };
}

/**
 * Widget loader 的 cache-first 纯 seam：缓存存在时完全不触网，
 * 直接以缓存快照构造成功结果；仅无缓存才调用 fetch。
 */
export function cacheFirstResult<TSnapshot, TResult>(
  cache: TSnapshot | null,
  fetch: () => Promise<TResult>,
): Promise<TResult | { ok: true; snapshot: TSnapshot }> {
  if (cache) return Promise.resolve({ ok: true, snapshot: cache });
  return fetch();
}

/** App 首帧后台刷新候选：provider + profile + 当前缓存时间。 */
export type AutoRefreshCandidate<TProvider extends string = string> = {
  provider: TProvider;
  profileId: string;
  fetchedAt: string | null;
};

/**
 * 纯 seam：App 首帧后台刷新只挑「无缓存」或「缓存已超过全局 reloadMinutes」
 * 的账号；fresh 账号直接沿用缓存，不联网。
 */
export function selectAutoRefreshTargets<TProvider extends string>(
  candidates: AutoRefreshCandidate<TProvider>[],
  options: { now: number; reloadMinutes: number },
): AutoRefreshCandidate<TProvider>[] {
  const maxAgeMs = Math.max(1, options.reloadMinutes) * 60_000;
  return candidates.filter(
    (candidate) => !isFreshFetchedAt(candidate.fetchedAt, options.now, maxAgeMs),
  );
}
