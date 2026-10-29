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
import { normalizeUsageSnapshot as normalizeWorkbuddyUsage } from "./workbuddy/normalize";
import type { UsageSnapshot as WorkbuddySnapshot } from "./workbuddy/types";
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
  workbuddy: {
    prefix: "ai_usage_workbuddy_cache_v2",
    normalize: normalizeWorkbuddyUsage,
  } satisfies CacheDefinition<WorkbuddySnapshot>,
};

function cachePrefix(provider: ProviderId): string | null {
  const definition = DEFINITIONS[provider] as
    | { prefix?: unknown }
    | undefined;
  if (!definition) return null;
  const prefix = definition.prefix;
  return typeof prefix === "string" ? prefix : null;
}

/**
 * 缓存键的唯一事实来源。备份恢复等需要清理缓存的路径必须复用本函数，
 * 不得再按平台自行硬编码版本号（历史上 WorkBuddy 因此漏清 v2 缓存）。
 */
export function snapshotCacheKey(
  provider: ProviderId,
  profileId: string,
): string | null {
  const prefix = cachePrefix(provider);
  return prefix ? `${prefix}_${profileId}` : null;
}

/**
 * 历史遗留缓存前缀：仅用于恢复备份时清掉旧版本键。
 * 只登记真实存在过的旧版本，不扩大其他平台的清理范围。
 */
const LEGACY_CACHE_PREFIXES: Partial<Record<ProviderId, readonly string[]>> = {
  workbuddy: ["ai_usage_workbuddy_cache_v1"],
};

/** 当前版本键 + 历史版本键，均限定在同一 provider/profileId 上。 */
export function snapshotCacheKeys(
  provider: ProviderId,
  profileId: string,
): string[] {
  const current = snapshotCacheKey(provider, profileId);
  const legacy = (LEGACY_CACHE_PREFIXES[provider] ?? []).map(
    (prefix) => `${prefix}_${profileId}`,
  );
  return current ? [current, ...legacy] : legacy;
}

/** 清理该 provider 账号的缓存；Storage 不可用时静默降级，不影响恢复主流程。 */
export function clearSnapshotCache(
  provider: ProviderId,
  profileId: string,
): string[] {
  const keys = snapshotCacheKeys(provider, profileId);
  for (const key of keys) {
    try {
      Storage.remove(key);
    } catch {
      /* ignore Storage failures */
    }
  }
  return keys;
}

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
  workbuddy: {
    ...ACCOUNT_PROVIDERS.workbuddy,
    cache: (profileId: string) => readSnapshot(profileId, DEFINITIONS.workbuddy),
  },
} satisfies Record<ProviderId, SnapshotProvider>;

export function getSnapshotProvider(provider: ProviderId): SnapshotProvider {
  return SNAPSHOT_PROVIDERS[provider];
}
