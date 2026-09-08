/** A per-operation deadline; requests must not start once the budget is spent. */
export function createRequestBudget(
  totalMs: number,
  now: () => number = Date.now,
) {
  const deadline = now() + totalMs;
  return {
    remainingMs: () => Math.max(0, deadline - now()),
    timeoutSeconds(capSeconds: number): number {
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error("刷新时间预算已用尽");
      return Math.min(capSeconds, remaining / 1000);
    },
  };
}
export type RequestBudget = ReturnType<typeof createRequestBudget>;
