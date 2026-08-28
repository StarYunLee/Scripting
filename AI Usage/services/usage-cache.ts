import { isFreshFetchedAt } from "./refresh-policy";

type UsageSnapshotBase = {
  fetchedAt: string;
  source: "live" | "cache";
};

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

type UsageCacheOptions<TSnapshot extends UsageSnapshotBase> = {
  keyPrefix: string;
  resolveProfileId(profileId?: string | null): string | null;
  recentMs?: number;
  now?: () => number;
};

/** 缓存条目有效性：fetchedAt 必须是可解析的有限时间戳，坏日期一律视为空。 */
function validSnapshot<TSnapshot extends UsageSnapshotBase>(
  value: TSnapshot | null | undefined,
): TSnapshot | null {
  if (!value?.fetchedAt) return null;
  return Number.isFinite(new Date(value.fetchedAt).getTime()) ? value : null;
}

export function createUsageCache<TSnapshot extends UsageSnapshotBase>(
  options: UsageCacheOptions<TSnapshot>,
) {
  // 无进程内缓存：App 是长驻上下文，任何正向/负向记忆都会让后续
  // 其他上下文（widget/intent）写入 shared 域的更新对 App 不可见。
  // 跨上下文一致性要求每次 read 都重查 shared 域。
  const recentMs = options.recentMs ?? 3 * 60_000;
  const now = options.now ?? (() => Date.now());
  const key = (profileId: string) => `${options.keyPrefix}${profileId}`;
  const resolve = (profileId?: string | null) =>
    options.resolveProfileId(profileId);

  function readDomain(id: string, shared: boolean): TSnapshot | null {
    try {
      const value = shared
        ? Storage.get<TSnapshot>(key(id), SHARED_STORAGE_OPTIONS)
        : Storage.get<TSnapshot>(key(id));
      const snapshot = validSnapshot(value);
      return snapshot
        ? ({ ...snapshot, source: "cache" } as TSnapshot)
        : null;
    } catch {
      return null;
    }
  }

  function read(profileId?: string | null): TSnapshot | null {
    const id = resolve(profileId);
    if (!id) return null;
    // shared 优先；miss 时迁移读取本脚本旧 local 同 key 数据（同样校验日期）。
    let snapshot = readDomain(id, true);
    if (!snapshot) {
      const legacy = readDomain(id, false);
      if (legacy) {
        snapshot = legacy;
        try {
          Storage.set(key(id), legacy, SHARED_STORAGE_OPTIONS);
        } catch {
          /* migration write is best effort */
        }
      }
    }
    return snapshot;
  }

  return {
    read,
    write(profileId: string, value: TSnapshot): void {
      const snapshot = { ...value, source: "cache" } as TSnapshot;
      try {
        Storage.set(key(profileId), snapshot, SHARED_STORAGE_OPTIONS);
      } catch {
        /* ignore */
      }
    },
    clear(profileId?: string | null): void {
      const id = resolve(profileId);
      if (!id) return;
      try {
        Storage.remove(key(id), SHARED_STORAGE_OPTIONS);
        Storage.remove(key(id));
      } catch {
        /* ignore */
      }
    },
    recoverRecent(profileId: string, force: boolean) {
      if (force) return null;
      const snapshot = read(profileId);
      if (!snapshot?.fetchedAt) return null;
      const fetchedAt = new Date(snapshot.fetchedAt).getTime();
      return Number.isFinite(fetchedAt) && now() - fetchedAt < recentMs
        ? { ok: true as const, snapshot }
        : null;
    },
  };
}
