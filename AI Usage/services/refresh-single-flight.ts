import type { RefreshOutcome, RefreshTarget } from "./refresh";

export function refreshTargetKey(target: RefreshTarget): string {
  return `${target.provider}:${target.profileId}`;
}

export function createRefreshSingleFlight() {
  const inFlight = new Map<string, {
    promise: Promise<RefreshOutcome>;
    isCurrent?: () => boolean;
  }>();

  function run(
    target: RefreshTarget,
    task: () => Promise<RefreshOutcome>,
    isCurrent?: () => boolean,
  ): Promise<RefreshOutcome> {
    const key = refreshTargetKey(target);
    const existing = inFlight.get(key);
    if (existing && (!existing.isCurrent || existing.isCurrent())) return existing.promise;
    const running = task();
    const entry = { promise: running, isCurrent };
    inFlight.set(key, entry);
    const clear = () => {
      if (inFlight.get(key) === entry) inFlight.delete(key);
    };
    running.then(clear, clear);
    return running;
  }

  return { run };
}
