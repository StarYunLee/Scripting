import { ACCOUNT_PROVIDERS } from "./account-registry";
import * as CodexAccounts from "./codex/accounts";
import * as GrokAccounts from "./grok/accounts";
import * as ClaudeAccounts from "./claude/accounts";
import * as AntigravityAccounts from "./antigravity/accounts";
import * as CursorAccounts from "./cursor/accounts";
import * as KimiAccounts from "./kimi/accounts";
import * as CopilotAccounts from "./copilot/accounts";
import {
  fetchUsage as fetchCodexUsage,
  getCachedUsage as getCodexCache,
  clearUsageCache as clearCodexCache,
} from "./codex/api";
import {
  startOpenAILogin,
  completeOpenAILogin,
  clearPendingOAuth as clearCodexPending,
  getPendingOAuthProfileId as getCodexPending,
  hasPendingOAuth as hasCodexPending,
} from "./codex/oauth";
import { normalizeUsageSnapshot as normalizeCodexUsage } from "./codex/normalize";
import { clearProfileSettings as clearCodexSettings } from "./codex/credentials";
import {
  fetchUsage as fetchGrokUsage,
  getCachedUsage as getGrokCache,
  clearUsageCache as clearGrokCache,
} from "./grok/api";
import {
  startGrokLogin,
  completeGrokLogin,
  clearPendingOAuth as clearGrokPending,
  getPendingOAuthProfileId as getGrokPending,
  hasPendingOAuth as hasGrokPending,
} from "./grok/oauth";
import { normalizeUsageSnapshot as normalizeGrokUsage } from "./grok/normalize";
import { clearProfileSettings as clearGrokSettings } from "./grok/credentials";
import {
  fetchUsage as fetchClaudeUsage,
  getCachedUsage as getClaudeCache,
  clearUsageCache as clearClaudeCache,
} from "./claude/api";
import {
  startClaudeLogin,
  completeClaudeLogin,
  clearPendingOAuth as clearClaudePending,
  getPendingOAuthProfileId as getClaudePending,
  hasPendingOAuth as hasClaudePending,
} from "./claude/oauth";
import { normalizeUsageSnapshot as normalizeClaudeUsage } from "./claude/normalize";
import { clearProfileSettings as clearClaudeSettings } from "./claude/credentials";
import {
  fetchUsage as fetchAntigravityUsage,
  getCachedUsage as getAntigravityCache,
  clearUsageCache as clearAntigravityCache,
} from "./antigravity/api";
import {
  startAntigravityLogin,
  completeAntigravityLogin,
  clearPendingOAuth as clearAntigravityPending,
  getPendingOAuthProfileId as getAntigravityPending,
  hasPendingOAuth as hasAntigravityPending,
} from "./antigravity/oauth";
import { normalizeUsageSnapshot as normalizeAntigravityUsage } from "./antigravity/normalize";
import { clearProfileSettings as clearAntigravitySettings } from "./antigravity/credentials";
import {
  fetchUsage as fetchCursorUsage,
  getCachedUsage as getCursorCache,
  clearUsageCache as clearCursorCache,
} from "./cursor/api";
import {
  startCursorLogin,
  completeCursorLogin,
  clearPendingOAuth as clearCursorPending,
  getPendingOAuthProfileId as getCursorPending,
  hasPendingOAuth as hasCursorPending,
} from "./cursor/oauth";
import { normalizeUsageSnapshot as normalizeCursorUsage } from "./cursor/normalize";
import { clearProfileSettings as clearCursorSettings } from "./cursor/credentials";
import {
  fetchUsage as fetchKimiUsage,
  getCachedUsage as getKimiCache,
  clearUsageCache as clearKimiCache,
} from "./kimi/api";
import {
  startKimiLogin,
  completeKimiLogin,
  clearPendingOAuth as clearKimiPending,
  getPendingOAuthProfileId as getKimiPending,
  hasPendingOAuth as hasKimiPending,
} from "./kimi/oauth";
import { normalizeUsageSnapshot as normalizeKimiUsage } from "./kimi/normalize";
import { clearProfileSettings as clearKimiSettings } from "./kimi/credentials";
import {
  fetchUsage as fetchCopilotUsage,
  getCachedUsage as getCopilotCache,
  clearUsageCache as clearCopilotCache,
} from "./copilot/api";
import {
  startCopilotLogin,
  completeCopilotLogin,
  clearPendingOAuth as clearCopilotPending,
  getPendingOAuthProfileId as getCopilotPending,
  hasPendingOAuth as hasCopilotPending,
} from "./copilot/oauth";
import { normalizeUsageSnapshot as normalizeCopilotUsage } from "./copilot/normalize";
import { clearProfileSettings as clearCopilotSettings } from "./copilot/credentials";
import type { ProviderId } from "../models";
import type { ProviderCore } from "./contracts";

export const PROVIDER_REGISTRY = {
  codex: {
    ...ACCOUNT_PROVIDERS.codex,
    ensure: CodexAccounts.ensureAccountMigration,
    create: CodexAccounts.createAccount,
    remove: CodexAccounts.deleteAccount,
    auth: {
      start: startOpenAILogin,
      complete: completeOpenAILogin,
      clearPending: clearCodexPending,
      pendingId: getCodexPending,
      hasPending: hasCodexPending,
    },
    usage: {
      fetch: fetchCodexUsage,
      cache: (profileId: string) => {
        const snapshot = getCodexCache(profileId);
        return snapshot ? normalizeCodexUsage(snapshot) : null;
      },
      clearCache: clearCodexCache,
    },
    clearSettings: clearCodexSettings,
  },
  grok: {
    ...ACCOUNT_PROVIDERS.grok,
    ensure: GrokAccounts.ensureAccountMigration,
    create: GrokAccounts.createAccount,
    remove: GrokAccounts.deleteAccount,
    auth: {
      start: startGrokLogin,
      complete: completeGrokLogin,
      clearPending: clearGrokPending,
      pendingId: getGrokPending,
      hasPending: hasGrokPending,
    },
    usage: {
      fetch: fetchGrokUsage,
      cache: (profileId: string) => {
        const snapshot = getGrokCache(profileId);
        return snapshot ? normalizeGrokUsage(snapshot) : null;
      },
      clearCache: clearGrokCache,
    },
    clearSettings: clearGrokSettings,
  },
  claude: {
    ...ACCOUNT_PROVIDERS.claude,
    ensure: ClaudeAccounts.ensureAccountMigration,
    create: ClaudeAccounts.createAccount,
    remove: ClaudeAccounts.deleteAccount,
    auth: {
      start: startClaudeLogin,
      complete: completeClaudeLogin,
      clearPending: clearClaudePending,
      pendingId: getClaudePending,
      hasPending: hasClaudePending,
    },
    usage: {
      fetch: fetchClaudeUsage,
      cache: (profileId: string) => {
        const snapshot = getClaudeCache(profileId);
        return snapshot ? normalizeClaudeUsage(snapshot) : null;
      },
      clearCache: clearClaudeCache,
    },
    clearSettings: clearClaudeSettings,
  },
  antigravity: {
    ...ACCOUNT_PROVIDERS.antigravity,
    ensure: AntigravityAccounts.ensureAccountMigration,
    create: AntigravityAccounts.createAccount,
    remove: AntigravityAccounts.deleteAccount,
    auth: {
      start: startAntigravityLogin,
      complete: completeAntigravityLogin,
      clearPending: clearAntigravityPending,
      pendingId: getAntigravityPending,
      hasPending: hasAntigravityPending,
    },
    usage: {
      fetch: fetchAntigravityUsage,
      cache: (profileId: string) => {
        const snapshot = getAntigravityCache(profileId);
        return snapshot ? normalizeAntigravityUsage(snapshot) : null;
      },
      clearCache: clearAntigravityCache,
    },
    clearSettings: clearAntigravitySettings,
  },
  cursor: {
    ...ACCOUNT_PROVIDERS.cursor,
    ensure: CursorAccounts.ensureAccountMigration,
    create: CursorAccounts.createAccount,
    remove: CursorAccounts.deleteAccount,
    auth: {
      start: startCursorLogin,
      complete: completeCursorLogin,
      clearPending: clearCursorPending,
      pendingId: getCursorPending,
      hasPending: hasCursorPending,
    },
    usage: {
      fetch: fetchCursorUsage,
      cache: (profileId: string) => {
        const snapshot = getCursorCache(profileId);
        return snapshot ? normalizeCursorUsage(snapshot) : null;
      },
      clearCache: clearCursorCache,
    },
    clearSettings: clearCursorSettings,
  },
  kimi: {
    ...ACCOUNT_PROVIDERS.kimi,
    ensure: KimiAccounts.ensureAccountMigration,
    create: KimiAccounts.createAccount,
    remove: KimiAccounts.deleteAccount,
    auth: {
      start: startKimiLogin,
      complete: completeKimiLogin,
      clearPending: clearKimiPending,
      pendingId: getKimiPending,
      hasPending: hasKimiPending,
    },
    usage: {
      fetch: fetchKimiUsage,
      cache: (profileId: string) => {
        const snapshot = getKimiCache(profileId);
        return snapshot ? normalizeKimiUsage(snapshot) : null;
      },
      clearCache: clearKimiCache,
    },
    clearSettings: clearKimiSettings,
  },
  copilot: {
    ...ACCOUNT_PROVIDERS.copilot,
    ensure: CopilotAccounts.ensureAccountMigration,
    create: CopilotAccounts.createAccount,
    remove: CopilotAccounts.deleteAccount,
    auth: {
      start: startCopilotLogin,
      complete: completeCopilotLogin,
      clearPending: clearCopilotPending,
      pendingId: getCopilotPending,
      hasPending: hasCopilotPending,
    },
    usage: {
      fetch: fetchCopilotUsage,
      cache: (profileId: string) => {
        const snapshot = getCopilotCache(profileId);
        return snapshot ? normalizeCopilotUsage(snapshot) : null;
      },
      clearCache: clearCopilotCache,
    },
    clearSettings: clearCopilotSettings,
  },
} satisfies Record<ProviderId, ProviderCore>;

export function getProvider(provider: ProviderId): ProviderCore {
  return PROVIDER_REGISTRY[provider];
}
