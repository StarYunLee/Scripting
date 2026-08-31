import { createAccountStore } from "../../services/account-store";
import type { AccountRegistry, ZaiAccountProfile, ZaiRegion } from "./types";

const store = createAccountStore<ZaiAccountProfile>({
  registryKey: "ai_usage_zai_account_registry_v1",
  secretPrefix: "ai_usage_zai_profile",
  createProfile: ({ id, name, now }) => ({
    id,
    name,
    email: null,
    accountId: null,
    createdAt: now,
    updatedAt: now,
  }),
});

export function ensureAccountMigration(): AccountRegistry {
  return store.ensure() as AccountRegistry;
}

export function getAccountRegistry(): AccountRegistry {
  return store.registry() as AccountRegistry;
}

export function listAccounts(): ZaiAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): ZaiAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = ""): ZaiAccountProfile {
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
  return store.remove(profileId, ["access_token", "region", "account_id"]);
}

export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "access_token") : null;
}

export function getProfileRegion(profileId?: string | null): ZaiRegion | null {
  const profile = resolveProfile(profileId);
  const raw = profile ? store.getSecret(profile.id, "region") : null;
  if (raw === "intl" || raw === "cn") return raw;
  return null;
}

export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    region?: ZaiRegion | null;
    accountId?: string | null;
    email?: string | null;
    name?: string | null;
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  return store.setSecrets(
    profile.id,
    {
      access_token: value.accessToken,
      region: value.region ?? undefined,
      account_id: value.accountId ?? undefined,
    },
    value.accountId != null || value.email != null || value.name != null
      ? (account) => {
          const email = value.email || account.email || null;
          return {
            ...account,
            accountId: value.accountId || account.accountId,
            email,
            name: value.name || email || account.name,
            updatedAt: new Date().toISOString(),
          };
        }
      : undefined,
  );
}
