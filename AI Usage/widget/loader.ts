import {
  fetchUsage as fetchCodexUsage,
  getCachedUsage as getCodexCache,
} from "../providers/codex/api";
import { getEffectiveSettings as getCodexSettings } from "../providers/codex/credentials";
import type {
  UsageResult as CodexUsageResult,
  WidgetSettings as CodexWidgetSettings,
} from "../providers/codex/types";
import {
  fetchUsage as fetchGrokUsage,
  getCachedUsage as getGrokCache,
} from "../providers/grok/api";
import { getEffectiveSettings as getGrokSettings } from "../providers/grok/credentials";
import type {
  UsageResult as GrokUsageResult,
  WidgetSettings as GrokWidgetSettings,
} from "../providers/grok/types";
import {
  fetchUsage as fetchClaudeUsage,
  getCachedUsage as getClaudeCache,
} from "../providers/claude/api";
import { getEffectiveSettings as getClaudeSettings } from "../providers/claude/credentials";
import type {
  UsageResult as ClaudeUsageResult,
  WidgetSettings as ClaudeWidgetSettings,
} from "../providers/claude/types";
import {
  fetchUsage as fetchAntigravityUsage,
  getCachedUsage as getAntigravityCache,
} from "../providers/antigravity/api";
import { getEffectiveSettings as getAntigravitySettings } from "../providers/antigravity/credentials";
import type {
  UsageResult as AntigravityUsageResult,
  WidgetSettings as AntigravityWidgetSettings,
} from "../providers/antigravity/types";
import {
  fetchUsage as fetchCursorUsage,
  getCachedUsage as getCursorCache,
} from "../providers/cursor/api";
import { getEffectiveSettings as getCursorSettings } from "../providers/cursor/credentials";
import type {
  UsageResult as CursorUsageResult,
  WidgetSettings as CursorWidgetSettings,
} from "../providers/cursor/types";
import { getDemoWidgetResult, isDemoAccountId } from "../services/demo";
import { writeLog } from "../services/logger";
import type { ProviderId } from "../models";

export type LoadedWidgetUsage =
  | {
      provider: "codex";
      result: CodexUsageResult;
      settings: CodexWidgetSettings;
    }
  | {
      provider: "grok";
      result: GrokUsageResult;
      settings: GrokWidgetSettings;
    }
  | {
      provider: "claude";
      result: ClaudeUsageResult;
      settings: ClaudeWidgetSettings;
    }
  | {
      provider: "antigravity";
      result: AntigravityUsageResult;
      settings: AntigravityWidgetSettings;
    }
  | {
      provider: "cursor";
      result: CursorUsageResult;
      settings: CursorWidgetSettings;
    };

type LoadedCodexWidget = Extract<LoadedWidgetUsage, { provider: "codex" }>;
type LoadedGrokWidget = Extract<LoadedWidgetUsage, { provider: "grok" }>;
type LoadedClaudeWidget = Extract<LoadedWidgetUsage, { provider: "claude" }>;
type LoadedAntigravityWidget = Extract<
  LoadedWidgetUsage,
  { provider: "antigravity" }
>;
type LoadedCursorWidget = Extract<LoadedWidgetUsage, { provider: "cursor" }>;

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
    fetch: () => fetchCodexUsage({ force: false, profileId }),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getCodexCache(profileId),
    }),
  });
  return {
    provider: "codex",
    result,
    settings: getCodexSettings(profileId),
  };
}

async function loadGrok(profileId: string): Promise<LoadedGrokWidget> {
  const result = await loadProviderResult<GrokUsageResult>({
    provider: "grok",
    profileId,
    demo: () => getDemoWidgetResult("grok", profileId)!,
    fetch: () => fetchGrokUsage({ force: false, profileId }),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getGrokCache(profileId),
    }),
  });
  return {
    provider: "grok",
    result,
    settings: getGrokSettings(profileId),
  };
}

async function loadClaude(profileId: string): Promise<LoadedClaudeWidget> {
  const result = await loadProviderResult<ClaudeUsageResult>({
    provider: "claude",
    profileId,
    demo: () => getDemoWidgetResult("claude", profileId)!,
    fetch: () => fetchClaudeUsage({ force: false, profileId }),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getClaudeCache(profileId),
    }),
  });
  return {
    provider: "claude",
    result,
    settings: getClaudeSettings(profileId),
  };
}

async function loadAntigravity(
  profileId: string,
): Promise<LoadedAntigravityWidget> {
  const result = await loadProviderResult<AntigravityUsageResult>({
    provider: "antigravity",
    profileId,
    demo: () => getDemoWidgetResult("antigravity", profileId)!,
    fetch: () => fetchAntigravityUsage({ force: false, profileId }),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getAntigravityCache(profileId),
    }),
  });
  return {
    provider: "antigravity",
    result,
    settings: getAntigravitySettings(profileId),
  };
}

async function loadCursor(profileId: string): Promise<LoadedCursorWidget> {
  const result = await loadProviderResult<CursorUsageResult>({
    provider: "cursor",
    profileId,
    demo: () => getDemoWidgetResult("cursor", profileId)!,
    fetch: () => fetchCursorUsage({ force: false, profileId }),
    fallback: (error) => ({
      ok: false,
      error: unknownError(error),
      cache: getCursorCache(profileId),
    }),
  });
  return {
    provider: "cursor",
    result,
    settings: getCursorSettings(profileId),
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
  if (provider === "cursor") return loadCursor(profileId);
  return loadAntigravity(profileId);
}
