import { createAccountStore } from "../../services/account-store";
import type { AccountRegistry, CursorAccountProfile } from "./types";

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

const store = createAccountStore<CursorAccountProfile>({
  registryKey: "ai_usage_cursor_account_registry_v1",
  secretPrefix: "ai_usage_cursor_profile",
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
    const accounts = registry.accounts.map((account, index) => {
      const email =
        account.email ||
        jwtEmail(getSecret(account.id, "access_token"));
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
    return changed ? { ...registry, accounts } : registry;
  },
});

export function ensureAccountMigration(): AccountRegistry {
  return store.ensure() as AccountRegistry;
}

export function getAccountRegistry(): AccountRegistry {
  return store.registry() as AccountRegistry;
}

export function listAccounts(): CursorAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): CursorAccountProfile | null {
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

export function getProfileAccountId(profileId?: string | null): string | null {
  const profile = resolveProfile(profileId);
  return profile
    ? store.getSecret(profile.id, "account_id") || profile.accountId
    : null;
}

export function getProfileTokenExpiresAt(profileId?: string | null): number | null {
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
  },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  const ok = store.setSecret(profile.id, "access_token", value.accessToken);
  if (value.refreshToken)
    store.setSecret(profile.id, "refresh_token", value.refreshToken);
  if (value.expiresAt)
    store.setSecret(profile.id, "expires_at", String(value.expiresAt));
  if (value.accountId)
    store.setSecret(profile.id, "account_id", value.accountId);
  if (value.accountId || value.email)
    updateProfileIdentity(profile.id, {
      accountId: value.accountId,
      email: value.email,
    });
  return ok;
}
