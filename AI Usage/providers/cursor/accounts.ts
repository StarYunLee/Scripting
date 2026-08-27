import { createAccountStore } from "../../services/account-store";
import { parseJwtPayload } from "../../services/jwt-payload";
import type { AccountRegistry, CursorAccountProfile } from "./types";

function tokenEmail(token: string | null): string | null {
  const payload = parseJwtPayload(token);
  for (const key of [
    "email",
    "preferred_username",
    "upn",
    "unique_name",
    "userEmail",
  ]) {
    const value = payload?.[key];
    if (typeof value === "string" && value.includes("@")) return value.trim();
  }
  return null;
}

function placeholder(name: string | null | undefined): boolean {
  if (!name) return true;
  return /^账号\s*\d+$/i.test(name.trim()) || /^acct_/i.test(name.trim());
}

const store = createAccountStore<CursorAccountProfile>({
  registryKey: "ai_usage_cursor_account_registry_v1",
  secretPrefix: "ai_usage_cursor_profile",
  createProfile: ({ id, name, now }) => ({
    id,
    name,
    email: null,
    accountId: null,
    createdAt: now,
    updatedAt: now,
  }),
  migrate: (registry, { getSecret }) => {
    let changed = false;
    const accounts = registry.accounts.map((account, index) => {
      const email = account.email || tokenEmail(getSecret(account.id, "access_token"));
      if (email && (account.email !== email || account.name !== email)) {
        changed = true;
        return {
          ...account,
          email,
          name: email,
          updatedAt: new Date().toISOString(),
        };
      }
      const friendly = `账号 ${index + 1}`;
      if (!email && placeholder(account.name) && account.name !== friendly) {
        changed = true;
        return {
          ...account,
          name: friendly,
          updatedAt: new Date().toISOString(),
        };
      }
      return account;
    });
    return changed ? { ...registry, accounts } : registry;
  },
});

export function ensureAccountMigration(): AccountRegistry {
  return store.ensure() as AccountRegistry;
}
export function listAccounts(): CursorAccountProfile[] {
  return store.list();
}
export function resolveProfile(profileId?: string | null): CursorAccountProfile | null {
  return store.resolve(profileId);
}
export function createAccount(name = ""): CursorAccountProfile {
  return store.create(name);
}
export function updateProfileIdentity(
  profileId: string,
  identity: { accountId?: string | null; email?: string | null },
): void {
  store.update(profileId, (account, index) => {
    const email = identity.email || account.email || null;
    const name = email || (placeholder(account.name) ? `账号 ${index + 1}` : account.name);
    return {
      ...account,
      accountId: identity.accountId || account.accountId,
      email,
      name,
      updatedAt: new Date().toISOString(),
    };
  });
}
export function needsEmailBackfill(profile: CursorAccountProfile): boolean {
  return !profile.email || placeholder(profile.name);
}
export function deleteAccount(profileId: string): void {
  store.remove(profileId, ["access_token", "refresh_token", "expires_at", "account_id"]);
}
export function getProfileAccessToken(profileId?: string | null): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "access_token") : null;
}
export function getProfileRefreshToken(profileId?: string | null): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "refresh_token") : null;
}
export function getProfileTokenExpiresAt(profileId?: string | null): number | null {
  const profile = resolveProfile(profileId);
  const value = profile ? Number(store.getSecret(profile.id, "expires_at")) : NaN;
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
  const ok = store.setSecret(profile.id, "access_token", value.accessToken);
  if (value.refreshToken) store.setSecret(profile.id, "refresh_token", value.refreshToken);
  if (value.expiresAt) store.setSecret(profile.id, "expires_at", String(value.expiresAt));
  if (value.accountId) store.setSecret(profile.id, "account_id", value.accountId);
  if (value.accountId || value.email) updateProfileIdentity(profile.id, value);
  return ok;
}
