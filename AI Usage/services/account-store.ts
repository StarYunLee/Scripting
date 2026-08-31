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

export type AccountRemovalResult =
  | { ok: true; pendingSecretCleanup: boolean }
  | {
      ok: false;
      reason: "account_not_found" | "prepare_failed" | "registry_failed";
    };

export type SecretPatch = Record<string, string | null | undefined>;

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
  remove(profileId: string, secretFields: string[]): AccountRemovalResult;
  getSecret(profileId: string, field: string): string | null;
  setSecret(profileId: string, field: string, value: string | null): boolean;
  setSecrets(
    profileId: string,
    values: SecretPatch,
    updater?: (profile: TProfile, index: number) => TProfile,
  ): boolean;
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
  let pendingSecretCleanupChecked = false;

  const secretKey = (profileId: string, field: string) =>
    `${options.secretPrefix}_${profileId}_${field}`;
  const deletionMarkerKey = (profileId: string) =>
    `${options.secretPrefix}_${profileId}_pending_deletion`;

  function keychainValue(key: string):
    | { ok: true; value: string | null }
    | {
        ok: false;
      } {
    try {
      return { ok: true, value: Keychain.get(key) };
    } catch {
      return { ok: false };
    }
  }

  function removeKeychainValue(key: string): boolean {
    try {
      if (Keychain.remove(key)) return true;
      return Keychain.get(key) == null;
    } catch {
      return false;
    }
  }

  function getSecret(profileId: string, field: string): string | null {
    const result = keychainValue(secretKey(profileId, field));
    if (!result.ok) return null;
    const value = result.value;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function setSecret(
    profileId: string,
    field: string,
    value: string | null,
  ): boolean {
    const key = secretKey(profileId, field);
    try {
      if (!value) return removeKeychainValue(key);
      return Keychain.set(key, value.trim());
    } catch {
      return false;
    }
  }

  function restoreSecret(
    profileId: string,
    field: string,
    value: string | null,
  ): boolean {
    const key = secretKey(profileId, field);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const restored = value
          ? Keychain.set(key, value)
          : removeKeychainValue(key);
        if (restored) return true;
      } catch {
        /* retry once for a transient Keychain failure */
      }
    }
    return false;
  }

  function cleanupDeletionMarker(
    markerKey: string,
    profileId: string,
    fields: string[],
  ): boolean {
    let complete = true;
    for (const field of fields) {
      if (!setSecret(profileId, field, null)) complete = false;
    }
    if (!complete) return false;
    return removeKeychainValue(markerKey);
  }

  function retryPendingSecretCleanup(
    registry: AccountRegistryBase<TProfile>,
  ): void {
    let keys: string[];
    try {
      keys = Keychain.keys();
    } catch {
      return;
    }
    const prefix = `${options.secretPrefix}_`;
    for (const markerKey of keys) {
      if (
        !markerKey.startsWith(prefix) ||
        !markerKey.endsWith("_pending_deletion")
      )
        continue;
      const result = keychainValue(markerKey);
      if (!result.ok || !result.value) continue;
      try {
        const marker = JSON.parse(result.value) as {
          profileId?: unknown;
          fields?: unknown;
        };
        if (
          typeof marker.profileId !== "string" ||
          !Array.isArray(marker.fields) ||
          !marker.fields.every((field) => typeof field === "string")
        ) {
          removeKeychainValue(markerKey);
          continue;
        }
        if (
          registry.accounts.some((account) => account.id === marker.profileId)
        ) {
          removeKeychainValue(markerKey);
          continue;
        }
        cleanupDeletionMarker(markerKey, marker.profileId, marker.fields);
      } catch {
        removeKeychainValue(markerKey);
      }
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
    if (!pendingSecretCleanupChecked) {
      pendingSecretCleanupChecked = true;
      retryPendingSecretCleanup(registry);
    }
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
      if (!registry.accounts.some((account) => account.id === profileId)) {
        return { ok: false, reason: "account_not_found" };
      }
      const markerKey = deletionMarkerKey(profileId);
      const marker = JSON.stringify({
        profileId,
        fields: [...new Set(secretFields)],
        createdAt: new Date().toISOString(),
      });
      try {
        if (!Keychain.set(markerKey, marker)) {
          return { ok: false, reason: "prepare_failed" };
        }
      } catch {
        return { ok: false, reason: "prepare_failed" };
      }
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
      if (!write(next)) {
        removeKeychainValue(markerKey);
        return { ok: false, reason: "registry_failed" };
      }
      const cleaned = cleanupDeletionMarker(markerKey, profileId, secretFields);
      return { ok: true, pendingSecretCleanup: !cleaned };
    },
    getSecret,
    setSecret,
    setSecrets(profileId, values, updater) {
      const registry = ensure();
      const index = registry.accounts.findIndex(
        (account) => account.id === profileId,
      );
      if (index < 0) return false;

      const entries = Object.entries(values).filter(
        (entry): entry is [string, string | null] => entry[1] !== undefined,
      );
      const previous = new Map<string, string | null>();
      for (const [field] of entries) {
        const result = keychainValue(secretKey(profileId, field));
        if (!result.ok) return false;
        previous.set(field, result.value);
      }

      const written: string[] = [];
      for (const [field, value] of entries) {
        if (setSecret(profileId, field, value)) {
          written.push(field);
          continue;
        }
        let rollbackComplete = true;
        for (const rollbackField of written.reverse()) {
          if (
            !restoreSecret(
              profileId,
              rollbackField,
              previous.get(rollbackField) || null,
            )
          ) {
            rollbackComplete = false;
          }
        }
        if (!rollbackComplete) {
          throw new Error("凭据保存失败，且无法完整恢复旧值");
        }
        return false;
      }

      if (updater) {
        const accounts = registry.accounts.slice();
        accounts[index] = updater(accounts[index], index);
        if (!write({ ...registry, accounts })) {
          let rollbackComplete = true;
          for (const [field, value] of previous) {
            if (!restoreSecret(profileId, field, value)) {
              rollbackComplete = false;
            }
          }
          if (!rollbackComplete) {
            throw new Error("账号信息保存失败，且无法完整恢复旧凭据");
          }
          return false;
        }
      }
      return true;
    },
  };

  return store;
}
