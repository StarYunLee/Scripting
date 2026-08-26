import {
  startOpenAILogin,
  completeOpenAILogin,
  clearPendingOAuth as clearCodexPending,
  getPendingOAuthProfileId as getCodexPending,
  hasPendingOAuth as hasCodexPending,
} from "./codex/oauth";
import {
  startGrokLogin,
  completeGrokLogin,
  clearPendingOAuth as clearGrokPending,
  getPendingOAuthProfileId as getGrokPending,
  hasPendingOAuth as hasGrokPending,
} from "./grok/oauth";
import {
  startClaudeLogin,
  completeClaudeLogin,
  clearPendingOAuth as clearClaudePending,
  getPendingOAuthProfileId as getClaudePending,
  hasPendingOAuth as hasClaudePending,
} from "./claude/oauth";
import {
  startAntigravityLogin,
  completeAntigravityLogin,
  clearPendingOAuth as clearAntigravityPending,
  getPendingOAuthProfileId as getAntigravityPending,
  hasPendingOAuth as hasAntigravityPending,
} from "./antigravity/oauth";
import {
  startCursorLogin,
  completeCursorLogin,
  clearPendingOAuth as clearCursorPending,
  getPendingOAuthProfileId as getCursorPending,
  hasPendingOAuth as hasCursorPending,
} from "./cursor/oauth";
import {
  startKimiLogin,
  completeKimiLogin,
  clearPendingOAuth as clearKimiPending,
  getPendingOAuthProfileId as getKimiPending,
  hasPendingOAuth as hasKimiPending,
} from "./kimi/oauth";
import {
  startCopilotLogin,
  completeCopilotLogin,
  clearPendingOAuth as clearCopilotPending,
  getPendingOAuthProfileId as getCopilotPending,
  hasPendingOAuth as hasCopilotPending,
} from "./copilot/oauth";
import {
  startZaiLogin,
  completeZaiLogin,
  clearPendingOAuth as clearZaiPending,
  getPendingOAuthProfileId as getZaiPending,
  hasPendingOAuth as hasZaiPending,
} from "./zai/oauth";
import {
  startMinimaxLogin,
  completeMinimaxLogin,
  clearPendingOAuth as clearMinimaxPending,
  getPendingOAuthProfileId as getMinimaxPending,
  hasPendingOAuth as hasMinimaxPending,
} from "./minimax/oauth";
import type { ProviderId } from "../models";
import type { ProviderAuthCore } from "./contracts";

export const PROVIDER_AUTH_REGISTRY = {
  codex: {
    id: "codex",
    auth: {
      start: startOpenAILogin,
      complete: completeOpenAILogin,
      clearPending: clearCodexPending,
      pendingId: getCodexPending,
      hasPending: hasCodexPending,
    },
  },
  grok: {
    id: "grok",
    auth: {
      start: startGrokLogin,
      complete: completeGrokLogin,
      clearPending: clearGrokPending,
      pendingId: getGrokPending,
      hasPending: hasGrokPending,
    },
  },
  claude: {
    id: "claude",
    auth: {
      start: startClaudeLogin,
      complete: completeClaudeLogin,
      clearPending: clearClaudePending,
      pendingId: getClaudePending,
      hasPending: hasClaudePending,
    },
  },
  antigravity: {
    id: "antigravity",
    auth: {
      start: startAntigravityLogin,
      complete: completeAntigravityLogin,
      clearPending: clearAntigravityPending,
      pendingId: getAntigravityPending,
      hasPending: hasAntigravityPending,
    },
  },
  cursor: {
    id: "cursor",
    auth: {
      start: startCursorLogin,
      complete: completeCursorLogin,
      clearPending: clearCursorPending,
      pendingId: getCursorPending,
      hasPending: hasCursorPending,
    },
  },
  kimi: {
    id: "kimi",
    auth: {
      start: startKimiLogin,
      complete: completeKimiLogin,
      clearPending: clearKimiPending,
      pendingId: getKimiPending,
      hasPending: hasKimiPending,
    },
  },
  copilot: {
    id: "copilot",
    auth: {
      start: startCopilotLogin,
      complete: completeCopilotLogin,
      clearPending: clearCopilotPending,
      pendingId: getCopilotPending,
      hasPending: hasCopilotPending,
    },
  },
  zai: {
    id: "zai",
    auth: {
      start: startZaiLogin,
      complete: completeZaiLogin,
      clearPending: clearZaiPending,
      pendingId: getZaiPending,
      hasPending: hasZaiPending,
    },
  },
  minimax: {
    id: "minimax",
    auth: {
      start: startMinimaxLogin,
      complete: completeMinimaxLogin,
      clearPending: clearMinimaxPending,
      pendingId: getMinimaxPending,
      hasPending: hasMinimaxPending,
    },
  },
} satisfies Record<ProviderId, ProviderAuthCore>;

export function getProviderAuth(provider: ProviderId): ProviderAuthCore {
  return PROVIDER_AUTH_REGISTRY[provider];
}
