type UsageSnapshotBase = {
  fetchedAt: string;
  source: "live" | "cache";
};

type UsageCacheOptions<TSnapshot extends UsageSnapshotBase> = {
  keyPrefix: string;
  resolveProfileId(profileId?: string | null): string | null;
  recentMs?: number;
  onClear?: (profileId: string) => void;
};

export type UsageCache<TSnapshot extends UsageSnapshotBase> = {
  read(profileId?: string | null): TSnapshot | null;
  write(profileId: string, value: TSnapshot): void;
  clear(profileId?: string | null): void;
  recent(value: TSnapshot | null): boolean;
  recoverRecent(
    profileId: string,
    force: boolean,
  ): { ok: true; snapshot: TSnapshot } | null;
};

/**
 * Provider 用量缓存的共享实现。缓存 key 与快照结构由 Provider 决定；该模块只处理
 * Storage 容错、source=cache、三分钟去重和单次脚本运行内的读缓存。
 */
export function createUsageCache<TSnapshot extends UsageSnapshotBase>(
  options: UsageCacheOptions<TSnapshot>,
): UsageCache<TSnapshot> {
  const memory = new Map<string, TSnapshot | null>();
  const recentMs = options.recentMs ?? 3 * 60_000;
  const key = (profileId: string) => `${options.keyPrefix}${profileId}`;

  function resolve(profileId?: string | null): string | null {
    return options.resolveProfileId(profileId);
  }

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

  function write(profileId: string, value: TSnapshot): void {
    const snapshot = { ...value, source: "cache" } as TSnapshot;
    try {
      if (Storage.set(key(profileId), snapshot)) memory.set(profileId, snapshot);
    } catch {
      /* ignore */
    }
  }

  function clear(profileId?: string | null): void {
    const id = resolve(profileId);
    if (!id) return;
    try {
      Storage.remove(key(id));
      memory.set(id, null);
      options.onClear?.(id);
    } catch {
      /* ignore */
    }
  }

  function recent(value: TSnapshot | null): boolean {
    if (!value?.fetchedAt) return false;
    const fetchedAt = new Date(value.fetchedAt).getTime();
    return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < recentMs;
  }

  return {
    read,
    write,
    clear,
    recent,
    recoverRecent(profileId, force) {
      if (force) return null;
      const snapshot = read(profileId);
      return recent(snapshot) ? { ok: true, snapshot: snapshot! } : null;
    },
  };
}
