import type { AccountRemovalResult } from "./account-store";

export type AccountDeletionDependencies = {
  remove(): AccountRemovalResult;
  clearCache(): void;
  clearProviderSettings(): void;
  clearOverviewPreferences(): boolean;
  clearWidgetPreferences(): boolean;
  clearDashboardPreferences(): boolean;
  clearRefreshMetadata(): void;
};

export type AccountDeletionResult = {
  pendingSecretCleanup: boolean;
  pendingPreferenceCleanup: boolean;
};

function cleanup(action: () => void | boolean): boolean {
  try {
    return action() !== false;
  } catch {
    return false;
  }
}

export function deleteAccountData(
  dependencies: AccountDeletionDependencies,
): AccountDeletionResult {
  const removed = dependencies.remove();
  if (!removed.ok) {
    throw new Error(
      removed.reason === "prepare_failed"
        ? "无法准备安全删除，请检查 Keychain 后重试"
        : removed.reason === "registry_failed"
          ? "账号注册表保存失败，账号未删除"
          : "账号不存在或已经删除",
    );
  }

  const cleanupResults = [
    cleanup(dependencies.clearCache),
    cleanup(dependencies.clearProviderSettings),
    cleanup(dependencies.clearOverviewPreferences),
    cleanup(dependencies.clearWidgetPreferences),
    cleanup(dependencies.clearDashboardPreferences),
    cleanup(dependencies.clearRefreshMetadata),
  ];
  return {
    pendingSecretCleanup: removed.pendingSecretCleanup,
    pendingPreferenceCleanup: cleanupResults.some((result) => !result),
  };
}
