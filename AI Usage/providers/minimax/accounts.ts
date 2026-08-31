import { createAccountStore } from "../../services/account-store";
import { parseJwtPayload } from "../../services/jwt-payload";
import type {
  AccountRegistry,
  MinimaxAccountProfile,
  MinimaxRegion,
} from "./types";

function jwtEmail(token: string | null): string | null {
  const value = parseJwtPayload(token)?.email;
  return typeof value === "string" && value.includes("@") ? value : null;
}

const store = createAccountStore<MinimaxAccountProfile>({
  registryKey: "ai_usage_minimax_account_registry_v1",
  secretPrefix: "ai_usage_minimax_profile",
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
      const email = jwtEmail(getSecret(account.id, "access_token"));
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

export function ensureAccountMigration(): AccountRegistry {
  return store.ensure() as AccountRegistry;
}

export function getAccountRegistry(): AccountRegistry {
  return store.registry() as AccountRegistry;
}

export function listAccounts(): MinimaxAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): MinimaxAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = ""): MinimaxAccountProfile {
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

export function deleteAccount(profileId: string): void {
  store.remove(profileId, ["access_token", "region", "account_id"]);
}

export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "access_token") : null;
}

export function getProfileRegion(
  profileId?: string | null,
): MinimaxRegion | null {
  const profile = resolveProfile(profileId);
  const raw = profile ? store.getSecret(profile.id, "region") : null;
  if (raw === "intl" || raw === "cn") return raw;
  return null;
}

export function saveProfileCredentials(
  profileId: string,
  value: {
    accessToken: string;
    region?: MinimaxRegion | null;
    accountId?: string | null;
    email?: string | null;
    name?: string | null;
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  const ok = store.setSecret(profile.id, "access_token", value.accessToken);
  if (value.region) store.setSecret(profile.id, "region", value.region);
  if (value.accountId)
    store.setSecret(profile.id, "account_id", value.accountId);
  if (value.accountId || value.email || value.name)
    updateProfileIdentity(profile.id, {
      accountId: value.accountId,
      email: value.email,
      name: value.name,
    });
  return ok;
}
