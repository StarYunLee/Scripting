import { createAccountStore } from "../../services/account-store";
import type {
  AccountRegistry,
  WorkbuddyAccountProfile,
  WorkbuddyRegion,
} from "./types";
import { normalizeRegion } from "./regions";

export const WORKBUDDY_SECRET_FIELDS = [
  "access_token",
  "refresh_token",
  "expires_at",
  "refresh_expires_at",
  "domain",
  "token_type",
  "uid",
  "enterprise_id",
  "region",
  "account_id",
] as const;

const store = createAccountStore<WorkbuddyAccountProfile>({
  registryKey: "ai_usage_workbuddy_account_registry_v1",
  secretPrefix: "ai_usage_workbuddy_profile",
  createProfile: ({ id, name, now }) => ({
    id,
    name: name || "WorkBuddy",
    email: null,
    accountId: null,
    createdAt: now,
    updatedAt: now,
  }),
  migrate: (registry) => {
    let changed = false;
    const accounts = registry.accounts.map((account) => {
      const name = account.name
        .replace(/\s*·\s*(国内版|国际版)\s*$/, "")
        .trim();
      if (!name || name === account.name) return account;
      changed = true;
      return { ...account, name, updatedAt: new Date().toISOString() };
    });
    return changed ? { ...registry, accounts } : registry;
  },
});

export function ensureAccountMigration(): AccountRegistry {
  return store.ensure() as AccountRegistry;
}

export function getAccountRegistry(): AccountRegistry {
  return store.registry() as AccountRegistry;
}

export function listAccounts(): WorkbuddyAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): WorkbuddyAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = "WorkBuddy"): WorkbuddyAccountProfile {
  return store.create(name);
}

export function updateProfileIdentity(
  profileId: string,
  identity: {
    accountId?: string | null;
    email?: string | null;
    name?: string | null;
  },
): void {
  store.update(profileId, (account) => {
    const email = identity.email || account.email || null;
    return {
      ...account,
      accountId: identity.accountId || account.accountId,
      email,
      name: identity.name || email || account.name,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function deleteAccount(profileId: string) {
  return store.remove(profileId, [...WORKBUDDY_SECRET_FIELDS]);
}

function secret(profileId: string | null | undefined, field: string): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, field) : null;
}

export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  return secret(profileId, "access_token");
}

export function getProfileRefreshToken(
  profileId?: string | null,
): string | null {
  return secret(profileId, "refresh_token");
}

export function getProfileTokenExpiresAt(
  profileId?: string | null,
): number {
  const raw = secret(profileId, "expires_at");
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getProfileRefreshExpiresAt(
  profileId?: string | null,
): number {
  const raw = secret(profileId, "refresh_expires_at");
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getProfileDomain(profileId?: string | null): string | null {
  return secret(profileId, "domain");
}

export function getProfileTokenType(
  profileId?: string | null,
): string | null {
  return secret(profileId, "token_type");
}

export function getProfileUid(profileId?: string | null): string | null {
  return secret(profileId, "uid");
}

export function getProfileEnterpriseId(
  profileId?: string | null,
): string | null {
  return secret(profileId, "enterprise_id");
}

export function getProfileRegion(
  profileId?: string | null,
): WorkbuddyRegion | null {
  return normalizeRegion(secret(profileId, "region"));
}

export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: number | null;
    refreshExpiresAt?: number | null;
    domain?: string | null;
    tokenType?: string | null;
    uid?: string | null;
    enterpriseId?: string | null;
    region?: WorkbuddyRegion | null;
    accountId?: string | null;
    email?: string | null;
    name?: string | null;
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  const secrets: Record<string, string | null | undefined> = {
    access_token: value.accessToken,
    refresh_token:
      value.refreshToken === undefined ? undefined : value.refreshToken,
    expires_at:
      value.expiresAt === undefined
        ? undefined
        : value.expiresAt && value.expiresAt > 0
          ? String(value.expiresAt)
          : null,
    refresh_expires_at:
      value.refreshExpiresAt === undefined
        ? undefined
        : value.refreshExpiresAt && value.refreshExpiresAt > 0
          ? String(value.refreshExpiresAt)
          : null,
    domain: value.domain === undefined ? undefined : value.domain,
    token_type: value.tokenType === undefined ? undefined : value.tokenType,
    uid: value.uid === undefined ? undefined : value.uid,
    enterprise_id:
      value.enterpriseId === undefined ? undefined : value.enterpriseId,
    region: value.region === undefined ? undefined : value.region,
    account_id:
      value.accountId === undefined ? undefined : value.accountId,
  };
  const identity =
    value.accountId != null || value.email != null || value.name != null
      ? (account: WorkbuddyAccountProfile) => {
          const email = value.email || account.email || null;
          return {
            ...account,
            accountId: value.accountId || account.accountId,
            email,
            name: value.name || email || account.name,
            updatedAt: new Date().toISOString(),
          };
        }
      : undefined;
  return store.setSecrets(profile.id, secrets, identity);
}
