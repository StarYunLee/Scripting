import type { AccountRegistry, CopilotAccountProfile } from "./types";

const REGISTRY_KEY = "ai_usage_copilot_account_registry_v1";

const emptyRegistry = (): AccountRegistry => ({
  version: 1,
  defaultAccountId: null,
  accounts: [],
});

function secretKey(profileId: string, field: string): string {
  return `ai_usage_copilot_profile_${profileId}_${field}`;
}

function getSecretRaw(key: string): string | null {
  try {
    const value = Keychain.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function setSecretRaw(key: string, value: string | null): boolean {
  try {
    if (!value) {
      Keychain.remove(key);
      return true;
    }
    return Keychain.set(key, value.trim());
  } catch {
    return false;
  }
}

function makeId(): string {
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readRegistryRaw(): AccountRegistry {
  try {
    const value = Storage.get<AccountRegistry>(REGISTRY_KEY);
    if (value?.version === 1 && Array.isArray(value.accounts)) return value;
  } catch {
    /* ignore */
  }
  return emptyRegistry();
}

function writeRegistry(value: AccountRegistry): AccountRegistry {
  try {
    Storage.set(REGISTRY_KEY, value);
  } catch {
    /* ignore */
  }
  return value;
}

export function ensureAccountMigration(): AccountRegistry {
  return readRegistryRaw();
}

export function getAccountRegistry(): AccountRegistry {
  return ensureAccountMigration();
}

export function listAccounts(): CopilotAccountProfile[] {
  return getAccountRegistry().accounts;
}

export function resolveProfile(
  profileId?: string | null,
): CopilotAccountProfile | null {
  const registry = getAccountRegistry();
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
    registry.accounts.find((account) => account.id === registry.defaultAccountId) ||
    registry.accounts[0] ||
    null
  );
}

export function createAccount(name = ""): CopilotAccountProfile {
  const registry = getAccountRegistry();
  const now = new Date().toISOString();
  const profile: CopilotAccountProfile = {
    id: makeId(),
    name: name.trim() || `账号 ${registry.accounts.length + 1}`,
    email: null,
    accountId: null,
    createdAt: now,
    updatedAt: now,
  };
  writeRegistry({
    ...registry,
    defaultAccountId: registry.defaultAccountId || profile.id,
    accounts: [...registry.accounts, profile],
  });
  return profile;
}

export function updateProfileIdentity(
  profileId: string,
  identity: { accountId?: string | null; email?: string | null; name?: string | null },
): void {
  const registry = getAccountRegistry();
  writeRegistry({
    ...registry,
    accounts: registry.accounts.map((account) => {
      if (account.id !== profileId) return account;
      const email = identity.email || account.email || null;
      return {
        ...account,
        accountId: identity.accountId || account.accountId,
        email,
        name: identity.name || email || account.name,
        updatedAt: new Date().toISOString(),
      };
    }),
  });
}

export function deleteAccount(profileId: string): void {
  const registry = getAccountRegistry();
  const accounts = registry.accounts.filter((account) => account.id !== profileId);
  for (const field of ["access_token", "account_id"])
    setSecretRaw(secretKey(profileId, field), null);
  writeRegistry({
    ...registry,
    accounts,
    defaultAccountId:
      registry.defaultAccountId === profileId
        ? accounts[0]?.id || null
        : registry.defaultAccountId,
  });
}

export function getProfileAccessToken(profileId?: string | null): string | null {
  const profile = resolveProfile(profileId);
  return profile ? getSecretRaw(secretKey(profile.id, "access_token")) : null;
}

export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    accountId?: string | null;
    email?: string | null;
    name?: string | null;
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  const ok = setSecretRaw(secretKey(profile.id, "access_token"), value.accessToken);
  if (value.accountId)
    setSecretRaw(secretKey(profile.id, "account_id"), value.accountId);
  if (value.accountId || value.email || value.name)
    updateProfileIdentity(profile.id, {
      accountId: value.accountId,
      email: value.email,
      name: value.name,
    });
  return ok;
}
