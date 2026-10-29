/** Runtime-local invalidation only; not a cross-process lock or durable revision. */
let revision = 0;
export function invalidateUsageRuntime(): void {
  revision += 1;
}
export function usageRuntimeRevision(): number {
  return revision;
}

/** Coalesce current account operations; stale work may finish but cannot absorb a new operation. */
export function createAccountOperationFlight<T>() {
  const pending = new Map<string, { promise: Promise<T>; isCurrent?: () => boolean }>();
  return (
    key: string,
    task: () => Promise<T>,
    isCurrent?: () => boolean,
  ): Promise<T> => {
    const existing = pending.get(key);
    if (existing && (!existing.isCurrent || existing.isCurrent())) return existing.promise;
    const promise = Promise.resolve().then(task);
    const entry = { promise, isCurrent };
    pending.set(key, entry);
    const clear = () => {
      if (pending.get(key) === entry) pending.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  };
}
