import { createAccountStore } from "../../services/account-store";
import { parseJwtPayload } from "../../services/jwt-payload";
import type { AccountRegistry, CodexAccountProfile } from "./types";

function jwtEmail(token: string | null): string | null {
  const payload = parseJwtPayload(token);
  const profile = payload?.["https://api.openai.com/profile"] as
    Record<string, unknown> | undefined;
  const value = payload?.email ?? profile?.email;
  return typeof value === "string" && value.includes("@") ? value : null;
}

const store = createAccountStore<CodexAccountProfile>({
  registryKey: "ai_usage_codex_account_registry_v1",
  secretPrefix: "ai_usage_codex_profile",
  createProfile: ({ id, name, index, now }) => ({
    id,
    name,
    email: null,
    accountId: null,
    createdAt: now,
    updatedAt: now,
  }),
  migrate: (registry, { getSecret }) => {
    let changed = false;
    const accounts = registry.accounts.map((account) => {
      if (account.email) return account;
      const email = jwtEmail(getSecret(account.id, "id_token"));
      if (!email) return account;
      changed = true;
      return {
        ...account,
        email,
        name: email,
        updatedAt: new Date().toISOString(),
      };
    });
    return changed ? { ...registry, accounts } : registry;
  },
});

/** 将单账号凭证迁移到账号注册表，并保留原 Keychain 数据。 */
export function ensureAccountMigration(): AccountRegistry {
  return store.ensure() as AccountRegistry;
}

export function getAccountRegistry(): AccountRegistry {
  return store.registry() as AccountRegistry;
}

export function listAccounts(): CodexAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): CodexAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = ""): CodexAccountProfile {
  return store.create(name);
}

export function updateProfileIdentity(
  profileId: string,
  identity: { accountId?: string | null; email?: string | null },
): void {
  store.update(profileId, (a) => {
    const email = identity.email || a.email || null;
    return {
      ...a,
      accountId: identity.accountId || a.accountId,
      email,
      name: email || a.name,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function deleteAccount(profileId: string): void {
  store.remove(profileId, [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
    "account_id",
  ]);
}

export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  const p = resolveProfile(profileId);
  return p ? store.getSecret(p.id, "access_token") : null;
}

export function getProfileIdToken(profileId?: string | null): string | null {
  const p = resolveProfile(profileId);
  return p ? store.getSecret(p.id, "id_token") : null;
}

export function getProfileRefreshToken(
  profileId?: string | null,
): string | null {
  const p = resolveProfile(profileId);
  return p ? store.getSecret(p.id, "refresh_token") : null;
}

export function getProfileAccountId(profileId?: string | null): string | null {
  const p = resolveProfile(profileId);
  return p ? store.getSecret(p.id, "account_id") || p.accountId : null;
}

export function getProfileTokenExpiresAt(
  profileId?: string | null,
): number | null {
  const p = resolveProfile(profileId);
  const raw = p ? store.getSecret(p.id, "expires_at") : null;
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
  const ok = store.setSecret(p.id, "access_token", value.accessToken);
  if (value.refreshToken)
    store.setSecret(p.id, "refresh_token", value.refreshToken);
  if (value.idToken) store.setSecret(p.id, "id_token", value.idToken);
  if (value.expiresAt)
    store.setSecret(p.id, "expires_at", String(value.expiresAt));
  if (value.accountId) store.setSecret(p.id, "account_id", value.accountId);
  if (value.accountId || value.email)
    updateProfileIdentity(p.id, {
      accountId: value.accountId,
      email: value.email,
    });
  return ok;
}
