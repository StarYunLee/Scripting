import { AppIntentManager, AppIntentProtocol } from "scripting";
import { runIntentRefresh } from "./services/intent-refresh";
import type { ProviderId } from "./models";

async function refreshProviderIntent(provider: ProviderId): Promise<void> {
  await runIntentRefresh({ kind: "provider", provider });
}

async function refreshAllIntent(): Promise<void> {
  await runIntentRefresh({ kind: "all" });
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

export const RefreshAIUsageZaiIntent = AppIntentManager.register({
  name: "RefreshAIUsageZaiIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("zai"),
});

export const RefreshAIUsageMinimaxIntent = AppIntentManager.register({
  name: "RefreshAIUsageMinimaxIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshProviderIntent("minimax"),
});

export const RefreshAIUsageAllIntent = AppIntentManager.register({
  name: "RefreshAIUsageAllIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => refreshAllIntent(),
});
