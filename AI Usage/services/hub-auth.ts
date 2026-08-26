import { getProvider } from "../providers/registry";
import { isDemoMode } from "./demo-flags";
import { writeLog } from "./logger";
import { PROVIDER_IDS, type ProviderId } from "../models";

export function findPendingAuth(): {
  provider: ProviderId;
  profileId: string;
} | null {
  for (const id of PROVIDER_IDS) {
    const api = getProvider(id);
    if (!api.auth.hasPending()) continue;
    const profileId = api.auth.pendingId();
    if (profileId) return { provider: id, profileId };
  }
  return null;
}

export async function beginProviderAuth(
  provider: ProviderId,
  profileId?: string,
): Promise<{ profileId: string; url: string }> {
  if (isDemoMode()) throw new Error("演示模式不会发起真实授权");
  const api = getProvider(provider);
  const account = profileId ? { id: profileId } : api.create();
  try {
    const url = await api.auth.start(account.id);
    writeLog({
      level: "info",
      source: "app",
      category: "auth",
      event: "auth.started",
      provider,
      accountId: account.id,
      message: "授权流程已开始",
    });
    return { profileId: account.id, url };
  } catch (error) {
    writeLog({
      level: "error",
      source: "app",
      category: "auth",
      event: "auth.start_failed",
      provider,
      accountId: account.id,
      message: "启动授权失败",
      code: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

export async function completeProviderAuth(
  provider: ProviderId,
  input: string,
): Promise<void> {
  if (isDemoMode()) throw new Error("演示模式不会完成真实授权");
  try {
    await getProvider(provider).auth.complete(input);
    writeLog({
      level: "info",
      source: "app",
      category: "auth",
      event: "auth.succeeded",
      provider,
      message: "授权成功",
    });
  } catch (error) {
    writeLog({
      level: "error",
      source: "app",
      category: "auth",
      event: "auth.failed",
      provider,
      message: "授权失败",
      code: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

export function cancelProviderAuth(
  provider: ProviderId,
  profileId: string,
): void {
  const api = getProvider(provider);
  api.auth.clearPending();
  if (!api.token(profileId)) {
    api.usage.clearCache(profileId);
    api.clearSettings(profileId);
    api.remove(profileId);
  }
}
