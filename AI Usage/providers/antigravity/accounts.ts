import { createAccountStore } from "../../services/account-store";
import type { AccountRegistry, AntigravityAccountProfile } from "./types";

const store = createAccountStore<AntigravityAccountProfile>({
  registryKey: "ai_usage_antigravity_account_registry_v1",
  secretPrefix: "ai_usage_antigravity_profile",
  createProfile: ({ id, name, index, now }) => ({
    id,
    name,
    email: null,
    accountId: null,
    projectId: null,
    planLabel: null,
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

export function listAccounts(): AntigravityAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): AntigravityAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = ""): AntigravityAccountProfile {
  return store.create(name);
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
  store.update(profileId, (a) => ({
    ...a,
    email: patch.email || a.email || null,
    accountId: patch.accountId ?? a.accountId,
    projectId: patch.projectId ?? a.projectId,
    planLabel: patch.planLabel ?? a.planLabel,
    name: patch.email || a.email || a.name,
    updatedAt: new Date().toISOString(),
  }));
}

export function deleteAccount(profileId: string): void {
  store.remove(profileId, [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
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

export function getProfileTokenExpiresAt(
  profileId?: string | null,
): number | null {
  const p = resolveProfile(profileId);
  const raw = p ? store.getSecret(p.id, "expires_at") : null;
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
  const ok = store.setSecret(p.id, "access_token", value.accessToken);
  if (value.refreshToken)
    store.setSecret(p.id, "refresh_token", value.refreshToken);
  if (value.idToken) store.setSecret(p.id, "id_token", value.idToken);
  if (value.expiresAt)
    store.setSecret(p.id, "expires_at", String(value.expiresAt));
  if (value.email || value.accountId || value.projectId || value.planLabel)
    updateProfileInfo(p.id, {
      email: value.email,
      accountId: value.accountId,
      projectId: value.projectId,
      planLabel: value.planLabel,
    });
  return ok;
}
