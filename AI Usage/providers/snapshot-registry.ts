import { ACCOUNT_PROVIDERS } from "./account-registry";
import { normalizeUsageSnapshot as normalizeCodexUsage } from "./codex/normalize";
import type { UsageSnapshot as CodexSnapshot } from "./codex/types";
import { normalizeUsageSnapshot as normalizeGrokUsage } from "./grok/normalize";
import type { UsageSnapshot as GrokSnapshot } from "./grok/types";
import { normalizeUsageSnapshot as normalizeClaudeUsage } from "./claude/normalize";
import type { UsageSnapshot as ClaudeSnapshot } from "./claude/types";
import { normalizeUsageSnapshot as normalizeAntigravityUsage } from "./antigravity/normalize";
import type { UsageSnapshot as AntigravitySnapshot } from "./antigravity/types";
import { normalizeUsageSnapshot as normalizeCursorUsage } from "./cursor/normalize";
import type { UsageSnapshot as CursorSnapshot } from "./cursor/types";
import { normalizeUsageSnapshot as normalizeKimiUsage } from "./kimi/normalize";
import type { UsageSnapshot as KimiSnapshot } from "./kimi/types";
import { normalizeUsageSnapshot as normalizeCopilotUsage } from "./copilot/normalize";
import type { UsageSnapshot as CopilotSnapshot } from "./copilot/types";
import { normalizeUsageSnapshot as normalizeZaiUsage } from "./zai/normalize";
import type { UsageSnapshot as ZaiSnapshot } from "./zai/types";
import { normalizeUsageSnapshot as normalizeMinimaxUsage } from "./minimax/normalize";
import type { UsageSnapshot as MinimaxSnapshot } from "./minimax/types";
import type { ProviderId } from "../models";
import type { AccountLookupProvider } from "./contracts";
import {
  sanitizeNormalizedUsageSnapshot,
  type NormalizedUsageSnapshot,
} from "../services/usage-model";

export type SnapshotProvider = AccountLookupProvider & {
  cache(profileId: string): NormalizedUsageSnapshot | null;
};

type CacheDefinition<T> = {
  prefix: string;
  normalize(snapshot: T): NormalizedUsageSnapshot;
};

function readSnapshot<T>(
  profileId: string,
  definition: CacheDefinition<T>,
): NormalizedUsageSnapshot | null {
  try {
    const raw = Storage.get<T>(`${definition.prefix}_${profileId}`);
    if (!raw) return null;
    return sanitizeNormalizedUsageSnapshot(definition.normalize(raw));
  } catch {
    return null;
  }
}

const DEFINITIONS = {
  codex: {
    prefix: "ai_usage_codex_cache_v1",
    normalize: normalizeCodexUsage,
  } satisfies CacheDefinition<CodexSnapshot>,
  grok: {
    prefix: "ai_usage_grok_cache_v1",
    normalize: normalizeGrokUsage,
  } satisfies CacheDefinition<GrokSnapshot>,
  claude: {
    prefix: "ai_usage_claude_cache_v1",
    normalize: normalizeClaudeUsage,
  } satisfies CacheDefinition<ClaudeSnapshot>,
  antigravity: {
    prefix: "ai_usage_antigravity_cache_v1",
    normalize: normalizeAntigravityUsage,
  } satisfies CacheDefinition<AntigravitySnapshot>,
  cursor: {
    prefix: "ai_usage_cursor_cache_v3",
    normalize: normalizeCursorUsage,
  } satisfies CacheDefinition<CursorSnapshot>,
  kimi: {
    prefix: "ai_usage_kimi_cache_v1",
    normalize: normalizeKimiUsage,
  } satisfies CacheDefinition<KimiSnapshot>,
  copilot: {
    prefix: "ai_usage_copilot_cache_v1",
    normalize: normalizeCopilotUsage,
  } satisfies CacheDefinition<CopilotSnapshot>,
  zai: {
    prefix: "ai_usage_zai_cache_v1",
    normalize: normalizeZaiUsage,
  } satisfies CacheDefinition<ZaiSnapshot>,
  minimax: {
    prefix: "ai_usage_minimax_cache_v1",
    normalize: normalizeMinimaxUsage,
  } satisfies CacheDefinition<MinimaxSnapshot>,
};

export const SNAPSHOT_PROVIDERS = {
  codex: {
    ...ACCOUNT_PROVIDERS.codex,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.codex),
  },
  grok: {
    ...ACCOUNT_PROVIDERS.grok,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.grok),
  },
  claude: {
    ...ACCOUNT_PROVIDERS.claude,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.claude),
  },
  antigravity: {
    ...ACCOUNT_PROVIDERS.antigravity,
    cache: (profileId: string) =>
      readSnapshot(profileId, DEFINITIONS.antigravity),
  },
  cursor: {
    ...ACCOUNT_PROVIDERS.cursor,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.cursor),
  },
  kimi: {
    ...ACCOUNT_PROVIDERS.kimi,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.kimi),
  },
  copilot: {
    ...ACCOUNT_PROVIDERS.copilot,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.copilot),
  },
  zai: {
    ...ACCOUNT_PROVIDERS.zai,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.zai),
  },
  minimax: {
    ...ACCOUNT_PROVIDERS.minimax,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.minimax),
  },
} satisfies Record<ProviderId, SnapshotProvider>;

export function getSnapshotProvider(provider: ProviderId): SnapshotProvider {
  return SNAPSHOT_PROVIDERS[provider];
}
