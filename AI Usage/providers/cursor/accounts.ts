import type { AccountRegistry, CursorAccountProfile } from "./types";

const REGISTRY_KEY = "ai_usage_cursor_account_registry_v1";

const emptyRegistry = (): AccountRegistry => ({
  version: 1,
  defaultAccountId: null,
  accounts: [],
});

function secretKey(profileId: string, field: string): string {
  return `ai_usage_cursor_profile_${profileId}_${field}`;
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

function jwtEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    let raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (raw.length % 4) raw += "=";
    const payload = JSON.parse(
      decodeURIComponent(
        Array.from(atob(raw))
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join(""),
      ),
    ) as Record<string, unknown>;
    for (const key of [
      "email",
      "preferred_username",
      "upn",
      "unique_name",
      "userEmail",
    ]) {
      const value = payload[key];
      if (typeof value === "string" && value.includes("@")) return value.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  // 「账号 1」占位，或误把内部 profile id（acct_…）当成展示名。
  return (
    /^账号\s*\d+$/i.test(trimmed) ||
    /^acct_[a-z0-9]+_/i.test(trimmed)
  );
}

function friendlyAccountName(index: number): string {
  return `账号 ${index + 1}`;
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
  let registry = readRegistryRaw();
  if (!registry.accounts.length) return registry;
  let changed = false;
  const accounts = registry.accounts.map((account, index) => {
    const email =
      account.email ||
      jwtEmail(getSecretRaw(secretKey(account.id, "access_token")));
    const badName =
      isPlaceholderName(account.name) ||
      account.name === account.id ||
      /^acct_/i.test(account.name.trim());
    if (email) {
      const shouldRename =
        !account.email || badName || account.name !== email;
      if (!shouldRename && account.email === email) return account;
      changed = true;
      return {
        ...account,
        email,
        name: email,
        updatedAt: new Date().toISOString(),
      };
    }
    // 无邮箱时，把误写入的 acct_ id 还原为可读占位名。
    if (badName && account.name !== friendlyAccountName(index)) {
      changed = true;
      return {
        ...account,
        name: friendlyAccountName(index),
        updatedAt: new Date().toISOString(),
      };
    }
    return account;
  });
  if (changed) registry = writeRegistry({ ...registry, accounts });
  return registry;
}

export function getAccountRegistry(): AccountRegistry {
  return ensureAccountMigration();
}

export function listAccounts(): CursorAccountProfile[] {
  return getAccountRegistry().accounts;
}

export function resolveProfile(
  profileId?: string | null,
): CursorAccountProfile | null {
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

export function createAccount(name = ""): CursorAccountProfile {
  const registry = getAccountRegistry();
  const now = new Date().toISOString();
  const profile: CursorAccountProfile = {
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
  identity: { accountId?: string | null; email?: string | null },
): void {
  const registry = getAccountRegistry();
  writeRegistry({
    ...registry,
    accounts: registry.accounts.map((account, index) => {
      if (account.id !== profileId) return account;
      const email = identity.email || account.email || null;
      let name = account.name;
      if (email) {
        name = email;
      } else if (
        isPlaceholderName(name) ||
        name === account.id ||
        /^acct_/i.test(name.trim())
      ) {
        // 绝不用内部 id 做展示名；保留可读占位。
        name = friendlyAccountName(index);
      }
      return {
        ...account,
        accountId: identity.accountId || account.accountId,
        email,
        name,
        updatedAt: new Date().toISOString(),
      };
    }),
  });
}

/** 是否仍缺邮箱或展示名异常，需要尝试回填。 */
export function needsEmailBackfill(profile: CursorAccountProfile): boolean {
  if (!profile.email) return true;
  return (
    isPlaceholderName(profile.name) ||
    profile.name === profile.id ||
    /^acct_/i.test(profile.name.trim())
  );
}

export function deleteAccount(profileId: string): void {
  const registry = getAccountRegistry();
  const accounts = registry.accounts.filter((account) => account.id !== profileId);
  for (const field of ["access_token", "refresh_token", "expires_at", "account_id"])
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

export function getProfileRefreshToken(profileId?: string | null): string | null {
  const profile = resolveProfile(profileId);
  return profile ? getSecretRaw(secretKey(profile.id, "refresh_token")) : null;
}

export function getProfileAccountId(profileId?: string | null): string | null {
  const profile = resolveProfile(profileId);
  return profile
    ? getSecretRaw(secretKey(profile.id, "account_id")) || profile.accountId
    : null;
}

export function getProfileTokenExpiresAt(profileId?: string | null): number | null {
  const profile = resolveProfile(profileId);
  const raw = profile ? getSecretRaw(secretKey(profile.id, "expires_at")) : null;
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: number | null;
    accountId?: string | null;
    email?: string | null;
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  const ok = setSecretRaw(secretKey(profile.id, "access_token"), value.accessToken);
  if (value.refreshToken)
    setSecretRaw(secretKey(profile.id, "refresh_token"), value.refreshToken);
  if (value.expiresAt)
    setSecretRaw(secretKey(profile.id, "expires_at"), String(value.expiresAt));
  if (value.accountId)
    setSecretRaw(secretKey(profile.id, "account_id"), value.accountId);
  if (value.accountId || value.email)
    updateProfileIdentity(profile.id, {
      accountId: value.accountId,
      email: value.email,
    });
  return ok;
}
