import { createAccountStore } from "../../services/account-store";
import type { AccountRegistry, DeepseekAccountProfile } from "./types";

/** 公开余额接口不返回邮箱或稳定 UID；Keychain 只保存 API Key。 */
export const DEEPSEEK_SECRET_FIELDS = ["access_token"] as const;

const store = createAccountStore<DeepseekAccountProfile>({
  registryKey: "ai_usage_deepseek_account_registry_v1",
  secretPrefix: "ai_usage_deepseek_profile",
  createProfile: ({ id, name, now }) => ({
    id,
    // 默认名可被用户改名；没有邮箱/UID 时不用 Key 片段伪造身份。
    name: name.trim() || "DeepSeek",
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

export function listAccounts(): DeepseekAccountProfile[] {
  return store.list();
}

export function resolveProfile(
  profileId?: string | null,
): DeepseekAccountProfile | null {
  return store.resolve(profileId);
}

export function createAccount(name = "DeepSeek"): DeepseekAccountProfile {
  return store.create(name);
}

export function updateProfileIdentity(
  profileId: string,
  identity: { name?: string | null; email?: string | null },
): DeepseekAccountProfile {
  const profile = profileId ? resolveProfile(profileId) : null;
  if (!profile) throw new Error("未找到要更新的 DeepSeek 账号");
  const updated = store.update(profile.id, (account) => ({
    ...account,
    email: identity.email || account.email || null,
    name: identity.name?.trim() || account.name,
    updatedAt: new Date().toISOString(),
  }));
  // store.update 在 Storage 写入失败或账号消失时返回 null：必须让调用方看到失败。
  if (!updated) {
    if (!resolveProfile(profile.id))
      throw new Error("未找到要更新的 DeepSeek 账号");
    throw new Error("账户名称保存失败，请稍后重试");
  }
  return updated;
}

export function deleteAccount(profileId: string) {
  return store.remove(profileId, [...DEEPSEEK_SECRET_FIELDS]);
}

export function getProfileAccessToken(
  profileId?: string | null,
): string | null {
  const profile = resolveProfile(profileId);
  return profile ? store.getSecret(profile.id, "access_token") : null;
}

export function saveProfileCredentials(
  profileId: string,
  value: { accessToken: string },
): boolean {
  const profile = resolveProfile(profileId);
  if (!profile) return false;
  return store.setSecrets(profile.id, {
    access_token: value.accessToken,
  });
}
