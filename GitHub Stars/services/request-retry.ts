export function createRevisionTracker<Key extends PropertyKey>(
  keys: readonly Key[],
) {
  const revisions = new Map<Key, number>(keys.map((key) => [key, 0]));
  return {
    current(key: Key): number {
      return revisions.get(key) ?? 0;
    },
    bump(...changedKeys: Key[]): void {
      for (const key of changedKeys) {
        revisions.set(key, (revisions.get(key) ?? 0) + 1);
      }
    },
    isCurrent(key: Key, revision: number): boolean {
      return (revisions.get(key) ?? 0) === revision;
    },
  };
}

export async function mapWithConcurrency<T, Result>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  let stopped = false;
  let firstError: unknown;
  async function worker(): Promise<void> {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await task(items[index]);
      } catch (error) {
        if (firstError === undefined) firstError = error;
        stopped = true;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  if (firstError !== undefined) throw firstError;
  return results;
}

export function createSingleFlight<Key, Result>() {
  const requests = new Map<Key, Promise<Result>>();
  return {
    run(key: Key, task: () => Promise<Result>): Promise<Result> {
      const existing = requests.get(key);
      if (existing) return existing;
      const request = task().finally(() => {
        if (requests.get(key) === request) requests.delete(key);
      });
      requests.set(key, request);
      return request;
    },
    clear(): void {
      requests.clear();
    },
  };
}

export function createMutationQueue<Key>() {
  const queues = new Map<Key, Promise<void>>();
  let generation = 0;
  return {
    run<Result>(key: Key, task: () => Promise<Result>): Promise<Result> {
      const requestGeneration = generation;
      const previous = queues.get(key) ?? Promise.resolve();
      const execute = () => {
        if (requestGeneration !== generation) {
          throw new Error("操作已因账户切换或本地数据清理而取消。");
        }
        return task();
      };
      const current = previous.then(execute, execute);
      const tracked = current.then(
        () => undefined,
        () => undefined,
      );
      queues.set(key, tracked);
      void tracked
        .finally(() => {
          if (queues.get(key) === tracked) queues.delete(key);
        })
        .catch(() => {});
      return current;
    },
    invalidate(): void {
      generation += 1;
      queues.clear();
    },
  };
}

export type RetryableError = {
  kind?: unknown;
  retryAfter?: unknown;
};

export const READ_RETRY_DELAYS_MS = [750, 1500] as const;

export function retryDelayMs(
  error: unknown,
  attempt: number,
  now = Date.now(),
): number | null {
  if (typeof error !== "object" || error === null) return null;
  const value = error as RetryableError;
  if (
    value.kind !== "network" &&
    value.kind !== "server" &&
    value.kind !== "rate_limited"
  ) {
    return null;
  }
  const retryAfter =
    typeof value.retryAfter === "string" ? value.retryAfter.trim() : "";
  const hasRetryAfter = retryAfter.length > 0;
  const seconds = hasRetryAfter ? Number(retryAfter) : NaN;
  const serverDelay = Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : retryAfter
      ? Math.max(0, Date.parse(retryAfter) - now)
      : NaN;
  const delay = Number.isFinite(serverDelay)
    ? serverDelay
    : READ_RETRY_DELAYS_MS[attempt];
  return delay !== undefined && delay <= 10_000 ? Math.max(250, delay) : null;
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
