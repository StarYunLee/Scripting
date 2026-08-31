import { createAccountStore } from "../../services/account-store";
import type { AccountRegistry, KimiAccountProfile } from "./types";

const DEVICE_ID_KEY = "ai_usage_kimi_device_id_v1";

const store = createAccountStore<KimiAccountProfile>({
  registryKey: "ai_usage_kimi_account_registry_v1",
  secretPrefix: "ai_usage_kimi_profile",
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

export function listAccounts(): KimiAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): KimiAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = ""): KimiAccountProfile {
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
  return store.remove(profileId, [
    "access_token",
    "refresh_token",
    "expires_at",
    "account_id",
  ]);
}

export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "access_token") : null;
}

export function getProfileRefreshToken(
  profileId?: string | null,
): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "refresh_token") : null;
}

export function getProfileTokenExpiresAt(
  profileId?: string | null,
): number | null {
  const profile = resolveProfile(profileId);
  const raw = profile ? store.getSecret(profile.id, "expires_at") : null;
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
    name?: string | null;
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  return store.setSecrets(
    profile.id,
    {
      access_token: value.accessToken,
      refresh_token: value.refreshToken ?? undefined,
      expires_at: value.expiresAt == null ? undefined : String(value.expiresAt),
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

/** 为 Kimi Code 请求生成稳定 Device-Id（Keychain 持久化）。 */
export function getStableDeviceId(): string {
  let existing: string | null = null;
  try {
    const v = Keychain.get(DEVICE_ID_KEY);
    if (typeof v === "string" && v.trim()) existing = v.trim();
  } catch {
    // ignore
  }
  if (existing) return existing;
  const id = Crypto.generateSymmetricKey(192)
    .toBase64String()
    .replace(/[^a-zA-Z0-9]/g, "")
    .padEnd(32, "0")
    .slice(0, 32)
    .toLowerCase();
  try {
    Keychain.set(DEVICE_ID_KEY, id);
  } catch {
    // ignore
  }
  return id;
}
