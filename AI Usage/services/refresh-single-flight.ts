import type { RefreshOutcome, RefreshTarget } from "./refresh";

export function refreshTargetKey(target: RefreshTarget): string {
  return `${target.provider}:${target.profileId}`;
}

export function createRefreshSingleFlight() {
  const inFlight = new Map<string, Promise<RefreshOutcome>>();

  function run(
    target: RefreshTarget,
    task: () => Promise<RefreshOutcome>,
  ): Promise<RefreshOutcome> {
    const key = refreshTargetKey(target);
    const existing = inFlight.get(key);
    if (existing) return existing;
    const running = task();
    inFlight.set(key, running);
    running.then(
      () => {
        if (inFlight.get(key) === running) inFlight.delete(key);
      },
      () => {
        if (inFlight.get(key) === running) inFlight.delete(key);
      },
    );
    return running;
  }

  return { run };
}
