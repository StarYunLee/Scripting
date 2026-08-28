import {
  fetchUsage as fetchCodexUsage,
  getCachedUsage as getCodexCache,
} from "../providers/codex/api";
import { cacheFirstResult } from "../services/refresh-policy";
import type {
  UsageResult as CodexUsageResult,
} from "../providers/codex/types";
import {
  fetchUsage as fetchGrokUsage,
  getCachedUsage as getGrokCache,
} from "../providers/grok/api";
import type {
  UsageResult as GrokUsageResult,
} from "../providers/grok/types";
import {
  fetchUsage as fetchClaudeUsage,
  getCachedUsage as getClaudeCache,
} from "../providers/claude/api";
import type {
  UsageResult as ClaudeUsageResult,
} from "../providers/claude/types";
import {
  fetchUsage as fetchAntigravityUsage,
  getCachedUsage as getAntigravityCache,
} from "../providers/antigravity/api";
import type {
  UsageResult as AntigravityUsageResult,
} from "../providers/antigravity/types";
import {
  fetchUsage as fetchCursorUsage,
  getCachedUsage as getCursorCache,
} from "../providers/cursor/api";
import type { UsageResult as CursorUsageResult } from "../providers/cursor/types";
import {
  fetchUsage as fetchKimiUsage,
  getCachedUsage as getKimiCache,
} from "../providers/kimi/api";
import type { UsageResult as KimiUsageResult } from "../providers/kimi/types";
import {
  fetchUsage as fetchCopilotUsage,
  getCachedUsage as getCopilotCache,
} from "../providers/copilot/api";
import type { UsageResult as CopilotUsageResult } from "../providers/copilot/types";
import {
  fetchUsage as fetchZaiUsage,
  getCachedUsage as getZaiCache,
} from "../providers/zai/api";
import type { UsageResult as ZaiUsageResult } from "../providers/zai/types";
import {
  fetchUsage as fetchMinimaxUsage,
  getCachedUsage as getMinimaxCache,
} from "../providers/minimax/api";
import type {
  UsageResult as MinimaxUsageResult,
} from "../providers/minimax/types";
import { getDemoWidgetResult, isDemoAccountId } from "../services/demo";
import { writeLog } from "../services/logger";
import type { ProviderId } from "../models";

export type LoadedWidgetUsage =
  | {
      provider: "codex";
      result: CodexUsageResult;
    }
  | {
      provider: "grok";
      result: GrokUsageResult;
    }
  | {
      provider: "claude";
      result: ClaudeUsageResult;
    }
  | {
      provider: "antigravity";
      result: AntigravityUsageResult;
    }
  | {
      provider: "cursor";
      result: CursorUsageResult;
    }
  | {
      provider: "kimi";
      result: KimiUsageResult;
    }
  | {
      provider: "copilot";
      result: CopilotUsageResult;
    }
  | {
      provider: "zai";
      result: ZaiUsageResult;
    }
  | {
      provider: "minimax";
      result: MinimaxUsageResult;
    };

type LoadedCodexWidget = Extract<LoadedWidgetUsage, { provider: "codex" }>;
type LoadedGrokWidget = Extract<LoadedWidgetUsage, { provider: "grok" }>;
type LoadedClaudeWidget = Extract<LoadedWidgetUsage, { provider: "claude" }>;
type LoadedAntigravityWidget = Extract<
  LoadedWidgetUsage,
  { provider: "antigravity" }
>;
type LoadedCursorWidget = Extract<LoadedWidgetUsage, { provider: "cursor" }>;
type LoadedKimiWidget = Extract<LoadedWidgetUsage, { provider: "kimi" }>;
type LoadedCopilotWidget = Extract<
  LoadedWidgetUsage,
  { provider: "copilot" }
>;
type LoadedZaiWidget = Extract<LoadedWidgetUsage, { provider: "zai" }>;
type LoadedMinimaxWidget = Extract<LoadedWidgetUsage, { provider: "minimax" }>;

function logLoadFailure(
  provider: ProviderId,
  profileId: string,
  error: unknown,
): void {
  writeLog({
    level: "error",
    source: "widget",
    category: "widget",
    event: "widget.load_failed",
    provider,
    accountId: profileId,
    message: "小组件加载失败",
    code: error instanceof Error ? error.name : "unknown",
  });
}

function unknownError(error: unknown) {
  return {
    code: "unknown" as const,
    message: "小组件加载失败",
    detail: error instanceof Error ? error.message : String(error),
  };
}

async function loadProviderResult<Result>(options: {
  provider: ProviderId;
  profileId: string;
  demo: () => Result;
  fetch: () => Promise<Result>;
  fallback: (error: unknown) => Result;
}): Promise<Result> {
  if (isDemoAccountId(options.profileId)) return options.demo();
  try {
    return await options.fetch();
  } catch (error) {
    logLoadFailure(options.provider, options.profileId, error);
    return options.fallback(error);
  }
}

async function loadCodex(profileId: string): Promise<LoadedCodexWidget> {
  const result = await loadProviderResult<CodexUsageResult>({
    provider: "codex",
    profileId,
    demo: () => getDemoWidgetResult("codex", profileId)!,
    fetch: () =>
      cacheFirstResult(getCodexCache(profileId), () =>
        fetchCodexUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getCodexCache(profileId),
    }),
  });
  return {
    provider: "codex",
    result,
  };
}

async function loadGrok(profileId: string): Promise<LoadedGrokWidget> {
  const result = await loadProviderResult<GrokUsageResult>({
    provider: "grok",
    profileId,
    demo: () => getDemoWidgetResult("grok", profileId)!,
    fetch: () =>
      cacheFirstResult(getGrokCache(profileId), () =>
        fetchGrokUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getGrokCache(profileId),
    }),
  });
  return {
    provider: "grok",
    result,
  };
}

async function loadClaude(profileId: string): Promise<LoadedClaudeWidget> {
  const result = await loadProviderResult<ClaudeUsageResult>({
    provider: "claude",
    profileId,
    demo: () => getDemoWidgetResult("claude", profileId)!,
    fetch: () =>
      cacheFirstResult(getClaudeCache(profileId), () =>
        fetchClaudeUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getClaudeCache(profileId),
    }),
  });
  return {
    provider: "claude",
    result,
  };
}

async function loadAntigravity(
  profileId: string,
): Promise<LoadedAntigravityWidget> {
  const result = await loadProviderResult<AntigravityUsageResult>({
    provider: "antigravity",
    profileId,
    demo: () => getDemoWidgetResult("antigravity", profileId)!,
    fetch: () =>
      cacheFirstResult(getAntigravityCache(profileId), () =>
        fetchAntigravityUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getAntigravityCache(profileId),
    }),
  });
  return {
    provider: "antigravity",
    result,
  };
}

async function loadCursor(profileId: string): Promise<LoadedCursorWidget> {
  const result = await loadProviderResult<CursorUsageResult>({
    provider: "cursor",
    profileId,
    demo: () => getDemoWidgetResult("cursor", profileId)!,
    fetch: () =>
      cacheFirstResult(getCursorCache(profileId), () =>
        fetchCursorUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getCursorCache(profileId),
    }),
  });
  return {
    provider: "cursor",
    result,
  };
}

async function loadKimi(profileId: string): Promise<LoadedKimiWidget> {
  const result = await loadProviderResult<KimiUsageResult>({
    provider: "kimi",
    profileId,
    demo: () => getDemoWidgetResult("kimi", profileId)!,
    fetch: () =>
      cacheFirstResult(getKimiCache(profileId), () =>
        fetchKimiUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getKimiCache(profileId),
    }),
  });
  return {
    provider: "kimi",
    result,
  };
}

async function loadCopilot(profileId: string): Promise<LoadedCopilotWidget> {
  const result = await loadProviderResult<CopilotUsageResult>({
    provider: "copilot",
    profileId,
    demo: () => getDemoWidgetResult("copilot", profileId)!,
    fetch: () =>
      cacheFirstResult(getCopilotCache(profileId), () =>
        fetchCopilotUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getCopilotCache(profileId),
    }),
  });
  return {
    provider: "copilot",
    result,
  };
}

async function loadZai(profileId: string): Promise<LoadedZaiWidget> {
  const result = await loadProviderResult<ZaiUsageResult>({
    provider: "zai",
    profileId,
    demo: () => getDemoWidgetResult("zai", profileId)!,
    fetch: () =>
      cacheFirstResult(getZaiCache(profileId), () =>
        fetchZaiUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getZaiCache(profileId),
    }),
  });
  return {
    provider: "zai",
    result,
  };
}

async function loadMinimax(profileId: string): Promise<LoadedMinimaxWidget> {
  const result = await loadProviderResult<MinimaxUsageResult>({
    provider: "minimax",
    profileId,
    demo: () => getDemoWidgetResult("minimax", profileId)!,
    fetch: () =>
      cacheFirstResult(getMinimaxCache(profileId), () =>
        fetchMinimaxUsage({ force: false, profileId }),
      ),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getMinimaxCache(profileId),
    }),
  });
  return {
    provider: "minimax",
    result,
  };
}

export function loadWidgetUsage(
  provider: "codex",
  profileId: string,
): Promise<LoadedCodexWidget>;
export function loadWidgetUsage(
  provider: "grok",
  profileId: string,
): Promise<LoadedGrokWidget>;
export function loadWidgetUsage(
  provider: "claude",
  profileId: string,
): Promise<LoadedClaudeWidget>;
export function loadWidgetUsage(
  provider: "antigravity",
  profileId: string,
): Promise<LoadedAntigravityWidget>;
export function loadWidgetUsage(
  provider: "cursor",
  profileId: string,
): Promise<LoadedCursorWidget>;
export function loadWidgetUsage(
  provider: "kimi",
  profileId: string,
): Promise<LoadedKimiWidget>;
export function loadWidgetUsage(
  provider: "copilot",
  profileId: string,
): Promise<LoadedCopilotWidget>;
export function loadWidgetUsage(
  provider: "zai",
  profileId: string,
): Promise<LoadedZaiWidget>;
export function loadWidgetUsage(
  provider: "minimax",
  profileId: string,
): Promise<LoadedMinimaxWidget>;
export function loadWidgetUsage(
  provider: ProviderId,
  profileId: string,
): Promise<LoadedWidgetUsage>;
export function loadWidgetUsage(
  provider: ProviderId,
  profileId: string,
): Promise<LoadedWidgetUsage> {
  if (provider === "codex") return loadCodex(profileId);
  if (provider === "grok") return loadGrok(profileId);
  if (provider === "claude") return loadClaude(profileId);
  if (provider === "antigravity") return loadAntigravity(profileId);
  if (provider === "cursor") return loadCursor(profileId);
  if (provider === "kimi") return loadKimi(profileId);
  if (provider === "copilot") return loadCopilot(profileId);
  if (provider === "zai") return loadZai(profileId);
  return loadMinimax(profileId);
}
