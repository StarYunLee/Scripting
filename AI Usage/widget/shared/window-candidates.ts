import type { ProviderId } from "../../models";
import {
  getCachedUsage as getCodexCache,
} from "../../providers/codex/api";
import {
  getCachedUsage as getGrokCache,
} from "../../providers/grok/api";
import {
  getCachedUsage as getClaudeCache,
} from "../../providers/claude/api";
import {
  getCachedUsage as getAntigravityCache,
} from "../../providers/antigravity/api";
import {
  getCachedUsage as getCursorCache,
} from "../../providers/cursor/api";
import {
  getCachedUsage as getKimiCache,
} from "../../providers/kimi/api";
import {
  getCachedUsage as getCopilotCache,
} from "../../providers/copilot/api";
import {
  getCachedUsage as getZaiCache,
} from "../../providers/zai/api";
import {
  getCachedUsage as getMinimaxCache,
} from "../../providers/minimax/api";
import { getDemoWidgetResult, isDemoAccountId } from "../../services/demo";
import { widgetWindowCandidates } from "./provider-windows";
import type { ProviderSnapshotInput } from "./provider-windows";
import type { WidgetWindow } from "./window-model";

type CacheReader = (profileId?: string | null) => ProviderSnapshotInput | null;

const CACHE_READERS: Record<ProviderId, CacheReader> = {
  codex: getCodexCache as CacheReader,
  grok: getGrokCache as CacheReader,
  claude: getClaudeCache as CacheReader,
  antigravity: getAntigravityCache as CacheReader,
  cursor: getCursorCache as CacheReader,
  kimi: getKimiCache as CacheReader,
  copilot: getCopilotCache as CacheReader,
  zai: getZaiCache as CacheReader,
  minimax: getMinimaxCache as CacheReader,
};

/**
 * 账号设置页候选窗口：真实账号来自最新缓存；演示账号来自同一 typed fixture，
 * 让 0/1/2/3/4 行真机矩阵可以通过正式设置 UI 验收而无需写临时 Storage。
 */
export function widgetWindowCandidatesFromCache(
  provider: ProviderId,
  profileId: string,
): WidgetWindow[] {
  if (isDemoAccountId(profileId)) {
    const demo = getDemoWidgetResult(provider, profileId);
    if (demo && demo.ok) {
      return widgetWindowCandidates(
        provider,
        demo.snapshot as ProviderSnapshotInput,
      );
    }
  }
  const read = CACHE_READERS[provider];
  if (!read) return [];
  return widgetWindowCandidates(provider, read(profileId));
}
