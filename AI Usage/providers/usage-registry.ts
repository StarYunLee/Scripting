import { ACCOUNT_PROVIDERS } from "./account-registry";
import { fetchUsage as fetchCodexUsage } from "./codex/api";
import { fetchUsage as fetchGrokUsage } from "./grok/api";
import { fetchUsage as fetchClaudeUsage } from "./claude/api";
import { fetchUsage as fetchAntigravityUsage } from "./antigravity/api";
import { fetchUsage as fetchCursorUsage } from "./cursor/api";
import { fetchUsage as fetchKimiUsage } from "./kimi/api";
import { fetchUsage as fetchCopilotUsage } from "./copilot/api";
import type { ProviderId } from "../models";
import type { UsageProvider } from "./contracts";

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
} satisfies Record<ProviderId, UsageProvider>;

export function getUsageProvider(provider: ProviderId): UsageProvider {
  return USAGE_PROVIDERS[provider];
}
