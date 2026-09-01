export type ClaudeFetchGateDecision =
  | { action: "use_cache" }
  | { action: "rate_limited"; blockedUntil: number }
  | { action: "fetch" };

/**
 * Claude 用量拉取门禁：未过期成功缓存优先于限流封锁。
 * force 刷新仍尊重 blockedUntil，避免在封锁窗口内反复打接口。
 */
export function decideClaudeFetchGate(input: {
  force: boolean;
  cacheIsRecent: boolean;
  blockedUntil: number | null;
}): ClaudeFetchGateDecision {
  if (!input.force && input.cacheIsRecent) return { action: "use_cache" };
  if (input.blockedUntil != null) {
    return { action: "rate_limited", blockedUntil: input.blockedUntil };
  }
  return { action: "fetch" };
}
