/** Runtime-local invalidation only; not a cross-process lock or durable revision. */
let revision = 0;
export function invalidateUsageRuntime(): void {
  revision += 1;
}
export function usageRuntimeRevision(): number {
  return revision;
}

/** Coalesce one account operation within this JS runtime. No credentials are retained after settlement. */
export function createAccountOperationFlight<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, task: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(task);
    pending.set(key, promise);
    const clear = () => {
      if (pending.get(key) === promise) pending.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  };
}
