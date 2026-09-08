import type { ProviderId } from "../models";
import type { NormalizedUsageSnapshot } from "./usage-model";
export type UsageProgress = {
  provider: ProviderId;
  profileId: string;
  snapshot: NormalizedUsageSnapshot;
};
const listeners = new Set<(event: UsageProgress) => void>();
/** App-only observers; publishing never persists a partial snapshot or starts background work. */
export function observeUsageProgress(
  listener: (event: UsageProgress) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function publishUsageProgress(event: UsageProgress): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* UI observers must not fail a provider request. */
    }
  }
}
