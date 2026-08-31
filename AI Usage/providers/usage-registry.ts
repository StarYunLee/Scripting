import { ACCOUNT_PROVIDERS } from "./account-registry";
import { fetchUsage as fetchCodexUsage } from "./codex/api";
import { fetchUsage as fetchGrokUsage } from "./grok/api";
import { fetchUsage as fetchClaudeUsage } from "./claude/api";
import { fetchUsage as fetchAntigravityUsage } from "./antigravity/api";
import { fetchUsage as fetchCursorUsage } from "./cursor/api";
import { fetchUsage as fetchKimiUsage } from "./kimi/api";
import { fetchUsage as fetchCopilotUsage } from "./copilot/api";
import { fetchUsage as fetchZaiUsage } from "./zai/api";
import { fetchUsage as fetchMinimaxUsage } from "./minimax/api";
import { normalizeUsageSnapshot as normalizeCodexUsage } from "./codex/normalize";
import { normalizeUsageSnapshot as normalizeGrokUsage } from "./grok/normalize";
import { normalizeUsageSnapshot as normalizeClaudeUsage } from "./claude/normalize";
import { normalizeUsageSnapshot as normalizeAntigravityUsage } from "./antigravity/normalize";
import { normalizeUsageSnapshot as normalizeCursorUsage } from "./cursor/normalize";
import { normalizeUsageSnapshot as normalizeKimiUsage } from "./kimi/normalize";
import { normalizeUsageSnapshot as normalizeCopilotUsage } from "./copilot/normalize";
import { normalizeUsageSnapshot as normalizeZaiUsage } from "./zai/normalize";
import { normalizeUsageSnapshot as normalizeMinimaxUsage } from "./minimax/normalize";
import type { ProviderId } from "../models";
import type { ProviderUsageError, UsageProvider } from "./contracts";
import type { NormalizedUsageSnapshot } from "../services/usage-model";

export const USAGE_PROVIDERS = {
  codex: {
    ...ACCOUNT_PROVIDERS.codex,
    fetch: fetchCodexUsage,
  },
  grok: {
    ...ACCOUNT_PROVIDERS.grok,
    fetch: fetchGrokUsage,
  },
  claude: {
    ...ACCOUNT_PROVIDERS.claude,
    fetch: fetchClaudeUsage,
  },
  antigravity: {
    ...ACCOUNT_PROVIDERS.antigravity,
    fetch: fetchAntigravityUsage,
  },
  cursor: {
    ...ACCOUNT_PROVIDERS.cursor,
    fetch: fetchCursorUsage,
  },
  kimi: {
    ...ACCOUNT_PROVIDERS.kimi,
    fetch: fetchKimiUsage,
  },
  copilot: {
    ...ACCOUNT_PROVIDERS.copilot,
    fetch: fetchCopilotUsage,
  },
  zai: {
    ...ACCOUNT_PROVIDERS.zai,
    fetch: fetchZaiUsage,
  },
  minimax: {
    ...ACCOUNT_PROVIDERS.minimax,
    fetch: fetchMinimaxUsage,
  },
} satisfies Record<ProviderId, UsageProvider>;

export type WidgetRefreshResult =
  | { ok: true; snapshot: NormalizedUsageSnapshot }
  | { ok: false; error: ProviderUsageError };

export type WidgetRefreshProvider = UsageProvider & {
  fetchSnapshot(options: {
    force?: boolean;
    profileId?: string | null;
  }): Promise<WidgetRefreshResult>;
};

function withSnapshot<T>(
  provider: UsageProvider,
  normalize: (snapshot: T) => NormalizedUsageSnapshot,
): WidgetRefreshProvider {
  return {
    ...provider,
    async fetchSnapshot(options) {
      const result = await provider.fetch(options);
      return result.ok
        ? { ok: true, snapshot: normalize(result.snapshot as T) }
        : result;
    },
  };
}

export const WIDGET_REFRESH_PROVIDERS = {
  codex: withSnapshot(USAGE_PROVIDERS.codex, normalizeCodexUsage),
  grok: withSnapshot(USAGE_PROVIDERS.grok, normalizeGrokUsage),
  claude: withSnapshot(USAGE_PROVIDERS.claude, normalizeClaudeUsage),
  antigravity: withSnapshot(
    USAGE_PROVIDERS.antigravity,
    normalizeAntigravityUsage,
  ),
  cursor: withSnapshot(USAGE_PROVIDERS.cursor, normalizeCursorUsage),
  kimi: withSnapshot(USAGE_PROVIDERS.kimi, normalizeKimiUsage),
  copilot: withSnapshot(USAGE_PROVIDERS.copilot, normalizeCopilotUsage),
  zai: withSnapshot(USAGE_PROVIDERS.zai, normalizeZaiUsage),
  minimax: withSnapshot(USAGE_PROVIDERS.minimax, normalizeMinimaxUsage),
} satisfies Record<ProviderId, WidgetRefreshProvider>;

export function getUsageProvider(provider: ProviderId): UsageProvider {
  return USAGE_PROVIDERS[provider];
}

export function getWidgetRefreshProvider(
  provider: ProviderId,
): WidgetRefreshProvider {
  return WIDGET_REFRESH_PROVIDERS[provider];
}
