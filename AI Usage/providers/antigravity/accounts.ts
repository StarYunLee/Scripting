import type { AccountRegistry, AntigravityAccountProfile } from "./types";

const REGISTRY_KEY = "ai_usage_antigravity_account_registry_v1";

const emptyRegistry = (): AccountRegistry => ({
  version: 1,
  defaultAccountId: null,
  accounts: [],
});
function secretKey(profileId: string, field: string): string {
  return `ai_usage_antigravity_profile_${profileId}_${field}`;
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
export function listAccounts(): AntigravityAccountProfile[] {
  return getAccountRegistry().accounts;
}
export function resolveProfile(
  profileId?: string | null,
): AntigravityAccountProfile | null {
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
export function createAccount(name = ""): AntigravityAccountProfile {
  const r = getAccountRegistry();
  const now = new Date().toISOString();
  const profile: AntigravityAccountProfile = {
    id: makeId(),
    name: name.trim() || `账号 ${r.accounts.length + 1}`,
    email: null,
    accountId: null,
    projectId: null,
    planLabel: null,
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
export function updateProfileInfo(
  profileId: string,
  patch: Partial<
    Pick<
      AntigravityAccountProfile,
      "email" | "accountId" | "projectId" | "planLabel"
    >
  >,
): void {
  const r = getAccountRegistry();
  writeRegistry({
    ...r,
    accounts: r.accounts.map((a) =>
      a.id === profileId
        ? {
            ...a,
            email: patch.email || a.email || null,
            accountId: patch.accountId ?? a.accountId,
            projectId: patch.projectId ?? a.projectId,
            planLabel: patch.planLabel ?? a.planLabel,
            name: patch.email || a.email || a.name,
            updatedAt: new Date().toISOString(),
          }
        : a,
    ),
  });
}
export function deleteAccount(profileId: string): void {
  const r = getAccountRegistry();
  for (const field of [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
  ])
    setSecretRaw(secretKey(profileId, field), null);
  const accounts = r.accounts.filter((a) => a.id !== profileId);
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
export function getProfileRefreshToken(
  profileId?: string | null,
): string | null {
  const p = resolveProfile(profileId);
  return p ? getSecretRaw(secretKey(p.id, "refresh_token")) : null;
}
export function getProfileTokenExpiresAt(
  profileId?: string | null,
): number | null {
  const p = resolveProfile(profileId);
  const raw = p ? getSecretRaw(secretKey(p.id, "expires_at")) : null;
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}
export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    refreshToken?: string | null;
    idToken?: string | null;
    expiresAt?: number | null;
    email?: string | null;
    accountId?: string | null;
    projectId?: string | null;
    planLabel?: string | null;
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
  if (value.email || value.accountId || value.projectId || value.planLabel)
    updateProfileInfo(p.id, {
      email: value.email,
      accountId: value.accountId,
      projectId: value.projectId,
      planLabel: value.planLabel,
    });
  return ok;
}
