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

function emptyRegistry<
  TProfile extends AccountProfileBase,
>(): AccountRegistryBase<TProfile> {
  return { version: 1, defaultAccountId: null, accounts: [] };
}

const FUTURE_VERSION_ERROR = "账号数据版本较新，请升级 AI Usage";

function normalizeRegistry<TProfile extends AccountProfileBase>(
  value: unknown,
): { registry: AccountRegistryBase<TProfile>; upgraded: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const registry = value as Partial<AccountRegistryBase<TProfile>>;
  if (!Array.isArray(registry.accounts)) return null;
  if (
    typeof registry.version === "number" &&
    Number.isFinite(registry.version) &&
    registry.version > 1
  ) {
    throw new Error(FUTURE_VERSION_ERROR);
  }
  if (registry.version !== undefined && registry.version !== 1) return null;
  return {
    registry: {
      version: 1,
      defaultAccountId:
        typeof registry.defaultAccountId === "string"
          ? registry.defaultAccountId
          : null,
      accounts: registry.accounts,
    },
    upgraded: registry.version !== 1,
  };
}

function makeAccountId(): string {
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

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

  function write(value: AccountRegistryBase<TProfile>): boolean {
    try {
      if (!Storage.set(options.registryKey, value)) return false;
      registryCache = value;
      return true;
    } catch {
      return false;
    }
  }

  function readRaw(): AccountRegistryBase<TProfile> {
    if (registryCache) return registryCache;
    try {
      const normalized = normalizeRegistry<TProfile>(
        Storage.get<unknown>(options.registryKey),
      );
      registryCache = normalized?.registry || emptyRegistry<TProfile>();
      if (normalized?.upgraded) write(registryCache);
    } catch (error) {
      if (error instanceof Error && error.message === FUTURE_VERSION_ERROR) {
        throw error;
      }
      registryCache = emptyRegistry<TProfile>();
    }
    return registryCache;
  }

  function ensure(): AccountRegistryBase<TProfile> {
    let registry = readRaw();
    if (migrationComplete) return registry;
    migrationComplete = true;
    if (options.migrate) {
      const migrated = options.migrate(registry, { getSecret });
      if (migrated !== registry && write(migrated)) registry = migrated;
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

  const store: AccountStore<TProfile> = {
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
      const next = {
        ...registry,
        defaultAccountId: registry.defaultAccountId || profile.id,
        accounts: [...registry.accounts, profile],
      };
      if (!write(next)) throw new Error("账号保存失败");
      return profile;
    },
    update(profileId, updater) {
      const registry = ensure();
      const index = registry.accounts.findIndex(
        (account) => account.id === profileId,
      );
      if (index < 0) return null;
      const accounts = registry.accounts.slice();
      accounts[index] = updater(accounts[index], index);
      if (!write({ ...registry, accounts })) return null;
      return accounts[index];
    },
    remove(profileId, secretFields) {
      const registry = ensure();
      const accounts = registry.accounts.filter(
        (account) => account.id !== profileId,
      );
      const next = {
        ...registry,
        accounts,
        defaultAccountId:
          registry.defaultAccountId === profileId
            ? accounts[0]?.id || null
            : registry.defaultAccountId,
      };
      if (!write(next)) return;
      for (const field of secretFields) setSecret(profileId, field, null);
    },
    getSecret,
    setSecret,
  };

  return store;
}
