import { createAccountStore } from "../../services/account-store";
import { parseJwtPayload } from "../../services/jwt-payload";
import type { AccountRegistry, GrokAccountProfile } from "./types";

function jwtEmail(token: string | null): string | null {
  const value = parseJwtPayload(token)?.email;
  return typeof value === "string" && value.includes("@") ? value : null;
}

const store = createAccountStore<GrokAccountProfile>({
  registryKey: "ai_usage_grok_account_registry_v1",
  secretPrefix: "ai_usage_grok_profile",
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

export function listAccounts(): GrokAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): GrokAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = ""): GrokAccountProfile {
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

export function deleteAccount(profileId: string) {
  return store.remove(profileId, [
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
  return store.setSecrets(
    p.id,
    {
      access_token: value.accessToken,
      refresh_token: value.refreshToken ?? undefined,
      id_token: value.idToken ?? undefined,
      expires_at: value.expiresAt == null ? undefined : String(value.expiresAt),
      account_id: value.accountId ?? undefined,
    },
    value.accountId != null || value.email != null
      ? (account) => {
          const email = value.email || account.email || null;
          return {
            ...account,
            accountId: value.accountId || account.accountId,
            email,
            name: email || account.name,
            updatedAt: new Date().toISOString(),
          };
        }
      : undefined,
  );
}
