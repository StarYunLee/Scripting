import { AppIntentManager, AppIntentProtocol } from "scripting";
import {
  refreshAllAuthorizedAccounts,
  refreshProviderAccounts,
} from "./services/refresh";
import { writeLog } from "./services/logger";
import { requestWidgetReload } from "./services/widgets";
import type { ProviderId } from "./models";

async function refreshProviderIntent(provider: ProviderId): Promise<void> {
  const summary = await refreshProviderAccounts(provider, {
    force: true,
    source: "intent",
  });
  requestWidgetReload();
  writeLog({
    level: summary.failed ? "warning" : "info",
    source: "intent",
    category: "refresh",
    event: "intent.refresh.completed",
    provider,
    message: `Intent 刷新完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
  });
}

async function refreshAllIntent(): Promise<void> {
  const summary = await refreshAllAuthorizedAccounts({
    force: true,
    source: "intent",
  });
  requestWidgetReload();
  writeLog({
    level: summary.failed ? "warning" : "info",
    source: "intent",
    category: "refresh",
    event: "intent.refresh_all.completed",
    message: `全部刷新完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
  });
}

export const RefreshAIUsageCodexIntent = AppIntentManager.register({
  name: "RefreshAIUsageCodexIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("codex"),
});

export const RefreshAIUsageGrokIntent = AppIntentManager.register({
  name: "RefreshAIUsageGrokIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("grok"),
});

export const RefreshAIUsageClaudeIntent = AppIntentManager.register({
  name: "RefreshAIUsageClaudeIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("claude"),
});

export const RefreshAIUsageAntigravityIntent = AppIntentManager.register({
  name: "RefreshAIUsageAntigravityIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("antigravity"),
});

export const RefreshAIUsageCursorIntent = AppIntentManager.register({
  name: "RefreshAIUsageCursorIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("cursor"),
});

export const RefreshAIUsageKimiIntent = AppIntentManager.register({
  name: "RefreshAIUsageKimiIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("kimi"),
});

export const RefreshAIUsageCopilotIntent = AppIntentManager.register({
  name: "RefreshAIUsageCopilotIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("copilot"),
});

export const RefreshAIUsageAllIntent = AppIntentManager.register({
  name: "RefreshAIUsageAllIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshAllIntent(),
});
