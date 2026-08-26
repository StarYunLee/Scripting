import type { AccountRegistry, CodexAccountProfile } from "./types";

const REGISTRY_KEY = "ai_usage_codex_account_registry_v1";

const emptyRegistry = (): AccountRegistry => ({
  version: 1,
  defaultAccountId: null,
  accounts: [],
});
function secretKey(profileId: string, field: string): string {
  return `ai_usage_codex_profile_${profileId}_${field}`;
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
    const profile = payload["https://api.openai.com/profile"] as
      | Record<string, unknown>
      | undefined;
    const value = payload.email ?? profile?.email;
    return typeof value === "string" && value.includes("@") ? value : null;
  } catch {
    return null;
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

/** 将单账号凭证迁移到账号注册表，并保留原 Keychain 数据。 */
export function ensureAccountMigration(): AccountRegistry {
  let registry = readRegistryRaw();
  if (!registry.accounts.length) return registry;
  let changed = false;
  const accounts = registry.accounts.map((account) => {
    if (account.email) return account;
    const email = jwtEmail(getSecretRaw(secretKey(account.id, "id_token")));
    if (!email) return account;
    changed = true;
    return {
      ...account,
      email,
      name: email,
      updatedAt: new Date().toISOString(),
    };
  });
  if (changed) registry = writeRegistry({ ...registry, accounts });
  return registry;
}
export function getAccountRegistry(): AccountRegistry {
  return ensureAccountMigration();
}
export function listAccounts(): CodexAccountProfile[] {
  return getAccountRegistry().accounts;
}
export function resolveProfile(
  profileId?: string | null,
): CodexAccountProfile | null {
  const r = getAccountRegistry();
  if (profileId) {
    const query = profileId.trim().toLowerCase();
    return (
      r.accounts.find(
        (a) =>
          a.id.toLowerCase() === query ||
          a.email?.toLowerCase() === query ||
          a.name.toLowerCase() === query,
      ) || null
    );
  }
  return (
    r.accounts.find((a) => a.id === r.defaultAccountId) || r.accounts[0] || null
  );
}
export function createAccount(name = ""): CodexAccountProfile {
  const r = getAccountRegistry();
  const now = new Date().toISOString();
  const profile: CodexAccountProfile = {
    id: makeId(),
    name: name.trim() || `账号 ${r.accounts.length + 1}`,
    email: null,
    accountId: null,
    createdAt: now,
    updatedAt: now,
  };
  writeRegistry({
    ...r,
    defaultAccountId: r.defaultAccountId || profile.id,
    accounts: [...r.accounts, profile],
  });
  return profile;
}
export function updateProfileIdentity(
  profileId: string,
  identity: { accountId?: string | null; email?: string | null },
): void {
  const r = getAccountRegistry();
  writeRegistry({
    ...r,
    accounts: r.accounts.map((a) => {
      if (a.id !== profileId) return a;
      const email = identity.email || a.email || null;
      return {
        ...a,
        accountId: identity.accountId || a.accountId,
        email,
        name: email || a.name,
        updatedAt: new Date().toISOString(),
      };
    }),
  });
}
export function deleteAccount(profileId: string): void {
  const r = getAccountRegistry();
  const accounts = r.accounts.filter((a) => a.id !== profileId);
  for (const field of [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
    "account_id",
  ])
    setSecretRaw(secretKey(profileId, field), null);
  writeRegistry({
    ...r,
    accounts,
    defaultAccountId:
      r.defaultAccountId === profileId
        ? accounts[0]?.id || null
        : r.defaultAccountId,
  });
}
export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  const p = resolveProfile(profileId);
  return p ? getSecretRaw(secretKey(p.id, "access_token")) : null;
}
export function getProfileIdToken(profileId?: string | null): string | null {
  const p = resolveProfile(profileId);
  return p ? getSecretRaw(secretKey(p.id, "id_token")) : null;
}
export function getProfileRefreshToken(
  profileId?: string | null,
): string | null {
  const p = resolveProfile(profileId);
  return p ? getSecretRaw(secretKey(p.id, "refresh_token")) : null;
}
export function getProfileAccountId(profileId?: string | null): string | null {
  const p = resolveProfile(profileId);
  return p ? getSecretRaw(secretKey(p.id, "account_id")) || p.accountId : null;
}
export function getProfileTokenExpiresAt(
  profileId?: string | null,
): number | null {
  const p = resolveProfile(profileId);
  const raw = p ? getSecretRaw(secretKey(p.id, "expires_at")) : null;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}
export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    refreshToken?: string | null;
    idToken?: string | null;
    expiresAt?: number | null;
    accountId?: string | null;
    email?: string | null;
  },
): boolean {
  const p = resolveProfile(profileId);
  if (!p) return false;
  const ok = setSecretRaw(secretKey(p.id, "access_token"), value.accessToken);
  if (value.refreshToken)
    setSecretRaw(secretKey(p.id, "refresh_token"), value.refreshToken);
  if (value.idToken) setSecretRaw(secretKey(p.id, "id_token"), value.idToken);
  if (value.expiresAt)
    setSecretRaw(secretKey(p.id, "expires_at"), String(value.expiresAt));
  if (value.accountId)
    setSecretRaw(secretKey(p.id, "account_id"), value.accountId);
  if (value.accountId || value.email)
    updateProfileIdentity(p.id, {
      accountId: value.accountId,
      email: value.email,
    });
  return ok;
}
