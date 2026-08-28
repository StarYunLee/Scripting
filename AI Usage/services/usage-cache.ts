type UsageSnapshotBase = {
  fetchedAt: string;
  source: "live" | "cache";
};

type UsageCacheOptions<TSnapshot extends UsageSnapshotBase> = {
  keyPrefix: string;
  resolveProfileId(profileId?: string | null): string | null;
  recentMs?: number;
};

export function createUsageCache<TSnapshot extends UsageSnapshotBase>(
  options: UsageCacheOptions<TSnapshot>,
) {
  const memory = new Map<string, TSnapshot | null>();
  const recentMs = options.recentMs ?? 3 * 60_000;
  const key = (profileId: string) => `${options.keyPrefix}${profileId}`;
  const resolve = (profileId?: string | null) =>
    options.resolveProfileId(profileId);

  function read(profileId?: string | null): TSnapshot | null {
    const id = resolve(profileId);
    if (!id) return null;
    if (memory.has(id)) return memory.get(id) || null;
    try {
      const value = Storage.get<TSnapshot>(key(id));
      const snapshot = value?.fetchedAt
        ? ({ ...value, source: "cache" } as TSnapshot)
        : null;
      memory.set(id, snapshot);
      return snapshot;
    } catch {
      memory.set(id, null);
      return null;
    }
  }

  return {
    read,
    write(profileId: string, value: TSnapshot): void {
      const snapshot = { ...value, source: "cache" } as TSnapshot;
      try {
        if (Storage.set(key(profileId), snapshot))
          memory.set(profileId, snapshot);
      } catch {
        /* ignore */
      }
    },
    clear(profileId?: string | null): void {
      const id = resolve(profileId);
      if (!id) return;
      try {
        Storage.remove(key(id));
        memory.set(id, null);
      } catch {
        /* ignore */
      }
    },
    recent(value: TSnapshot | null): boolean {
      if (!value?.fetchedAt) return false;
      const fetchedAt = new Date(value.fetchedAt).getTime();
      return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < recentMs;
    },
    recoverRecent(profileId: string, force: boolean) {
      if (force) return null;
      const snapshot = read(profileId);
      if (!snapshot?.fetchedAt) return null;
      const fetchedAt = new Date(snapshot.fetchedAt).getTime();
      return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < recentMs
        ? { ok: true as const, snapshot }
        : null;
    },
  };
}
