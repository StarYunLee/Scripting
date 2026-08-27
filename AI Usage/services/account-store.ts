export type AccountProfileBase = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountRegistryBase<TProfile extends AccountProfileBase> = {
  version: 1;
  defaultAccountId: string | null;
  accounts: TProfile[];
};

type AccountStoreOptions<TProfile extends AccountProfileBase> = {
  registryKey: string;
  secretPrefix: string;
  createProfile(input: {
    id: string;
    name: string;
    index: number;
    now: string;
  }): TProfile;
  migrate?: (
    registry: AccountRegistryBase<TProfile>,
    secrets: Pick<AccountStore<TProfile>, "getSecret">,
  ) => AccountRegistryBase<TProfile>;
};

export type AccountStore<TProfile extends AccountProfileBase> = {
  ensure(): AccountRegistryBase<TProfile>;
  registry(): AccountRegistryBase<TProfile>;
  list(): TProfile[];
  resolve(profileId?: string | null): TProfile | null;
  create(name?: string): TProfile;
  update(
    profileId: string,
    updater: (profile: TProfile, index: number) => TProfile,
  ): TProfile | null;
  remove(profileId: string, secretFields: string[]): void;
  getSecret(profileId: string, field: string): string | null;
  setSecret(profileId: string, field: string, value: string | null): boolean;
};

function emptyRegistry<TProfile extends AccountProfileBase>(): AccountRegistryBase<TProfile> {
  return { version: 1, defaultAccountId: null, accounts: [] };
}

function isRegistry<TProfile extends AccountProfileBase>(
  value: unknown,
): value is AccountRegistryBase<TProfile> {
  if (!value || typeof value !== "object") return false;
  const registry = value as Partial<AccountRegistryBase<TProfile>>;
  return registry.version === 1 && Array.isArray(registry.accounts);
}

function makeAccountId(): string {
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 账号注册表与 Keychain 的共享实现。注册表在单次脚本运行内只从 Storage 读取一次，
 * 写入成功后才更新内存副本，避免持久化失败时出现仅当前进程可见的幽灵账号。
 */
export function createAccountStore<TProfile extends AccountProfileBase>(
  options: AccountStoreOptions<TProfile>,
): AccountStore<TProfile> {
  let registryCache: AccountRegistryBase<TProfile> | null = null;
  let migrationComplete = false;

  const secretKey = (profileId: string, field: string) =>
    `${options.secretPrefix}_${profileId}_${field}`;

  function getSecret(profileId: string, field: string): string | null {
    try {
      const value = Keychain.get(secretKey(profileId, field));
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  function setSecret(
    profileId: string,
    field: string,
    value: string | null,
  ): boolean {
    try {
      if (!value) {
        Keychain.remove(secretKey(profileId, field));
        return true;
      }
      return Keychain.set(secretKey(profileId, field), value.trim());
    } catch {
      return false;
    }
  }

  function readRaw(): AccountRegistryBase<TProfile> {
    if (registryCache) return registryCache;
    try {
      const value = Storage.get<unknown>(options.registryKey);
      registryCache = isRegistry<TProfile>(value) ? value : emptyRegistry<TProfile>();
    } catch {
      registryCache = emptyRegistry<TProfile>();
    }
    return registryCache;
  }

  function write(
    value: AccountRegistryBase<TProfile>,
  ): AccountRegistryBase<TProfile> {
    try {
      if (Storage.set(options.registryKey, value)) registryCache = value;
    } catch {
      /* ignore */
    }
    return registryCache || value;
  }

  let store: AccountStore<TProfile>;

  function ensure(): AccountRegistryBase<TProfile> {
    let registry = readRaw();
    if (migrationComplete) return registry;
    migrationComplete = true;
    if (options.migrate) {
      const migrated = options.migrate(registry, { getSecret });
      if (migrated !== registry) registry = write(migrated);
    }
    return registry;
  }

  function resolve(profileId?: string | null): TProfile | null {
    const registry = ensure();
    if (profileId) {
      const query = profileId.trim().toLowerCase();
      return (
        registry.accounts.find(
          (account) =>
            account.id.toLowerCase() === query ||
            account.email?.toLowerCase() === query ||
            account.name.toLowerCase() === query,
        ) || null
      );
    }
    return (
      registry.accounts.find(
        (account) => account.id === registry.defaultAccountId,
      ) ||
      registry.accounts[0] ||
      null
    );
  }

  store = {
    ensure,
    registry: ensure,
    list: () => ensure().accounts,
    resolve,
    create(name = "") {
      const registry = ensure();
      const now = new Date().toISOString();
      const profile = options.createProfile({
        id: makeAccountId(),
        name: name.trim() || `账号 ${registry.accounts.length + 1}`,
        index: registry.accounts.length,
        now,
      });
      const persisted = write({
        ...registry,
        defaultAccountId: registry.defaultAccountId || profile.id,
        accounts: [...registry.accounts, profile],
      });
      const created = persisted.accounts.find(
        (account) => account.id === profile.id,
      );
      if (!created) throw new Error("账号保存失败");
      return created;
    },
    update(profileId, updater) {
      const registry = ensure();
      const index = registry.accounts.findIndex(
        (account) => account.id === profileId,
      );
      if (index < 0) return null;
      const nextProfile = updater(registry.accounts[index], index);
      const accounts = registry.accounts.slice();
      accounts[index] = nextProfile;
      const persisted = write({ ...registry, accounts });
      return (
        persisted.accounts.find((account) => account.id === profileId) || null
      );
    },
    remove(profileId, secretFields) {
      const registry = ensure();
      const accounts = registry.accounts.filter(
        (account) => account.id !== profileId,
      );
      const persisted = write({
        ...registry,
        accounts,
        defaultAccountId:
          registry.defaultAccountId === profileId
            ? accounts[0]?.id || null
            : registry.defaultAccountId,
      });
      if (!persisted.accounts.some((account) => account.id === profileId)) {
        for (const field of secretFields) setSecret(profileId, field, null);
      }
    },
    getSecret,
    setSecret,
  };

  return store;
}
