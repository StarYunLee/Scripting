import {
  clearCache,
  clearDetailCaches,
  clearForkStatusesCache,
  clearMembershipCache,
  clearOwnedRepositoriesCache,
} from "../services/cache";
import { createGitHubError } from "../services/errors";

let credentialRevision = 0;
export function invalidateCredentialSession(): void {
  credentialRevision += 1;
}

export function captureCredentialGuard(): () => void {
  const revision = credentialRevision;
  const token = readToken();
  return () => {
    if (revision !== credentialRevision || token !== readToken()) {
      throw createGitHubError(
        "unknown",
        "操作已因账户切换或本地数据清理而取消。",
      );
    }
  };
}

export function clearAccountCaches(): void {
  clearCache();
  clearDetailCaches();
  clearForkStatusesCache();
  clearMembershipCache();
  clearOwnedRepositoriesCache();
}

const TOKEN_KEY = "github_stars_token";

export function hasToken(): boolean {
  return typeof Keychain !== "undefined" && Keychain.contains(TOKEN_KEY);
}

export function readToken(): string | null {
  if (typeof Keychain === "undefined") {
    return null;
  }
  const token = Keychain.get(TOKEN_KEY);
  return token && token.trim() ? token.trim() : null;
}

export function saveToken(value: string): void {
  const token = value.trim();
  if (!token) {
    throw new Error("Token 不能为空");
  }
  if (
    !Keychain.set(TOKEN_KEY, token, { accessibility: "unlocked_this_device" })
  ) {
    throw new Error("Token 写入 Keychain 失败");
  }
  invalidateCredentialSession();
  clearAccountCaches();
}

export function removeToken(): void {
  Keychain.remove(TOKEN_KEY);
  invalidateCredentialSession();
  clearAccountCaches();
}

export function tokenMask(value: string | null): string {
  if (!value) return "";
  const prefixes = ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"];
  const prefix = prefixes.find((item) => value.startsWith(item)) ?? "";
  const rest = value.slice(prefix.length);
  if (rest.length <= 8) return `${prefix}••••`;
  return `${prefix}${rest.slice(0, 4)}…${rest.slice(-4)}`;
}

export function storedTokenMask(): string {
  return tokenMask(readToken());
}
