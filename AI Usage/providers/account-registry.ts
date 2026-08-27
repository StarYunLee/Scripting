import * as CodexAccounts from "./codex/accounts";
import * as GrokAccounts from "./grok/accounts";
import * as ClaudeAccounts from "./claude/accounts";
import * as AntigravityAccounts from "./antigravity/accounts";
import * as CursorAccounts from "./cursor/accounts";
import * as KimiAccounts from "./kimi/accounts";
import type { ProviderId } from "../models";
import type { AccountLookupProvider } from "./contracts";

export const ACCOUNT_PROVIDERS = {
  codex: {
    id: "codex",
    list: CodexAccounts.listAccounts,
    token: CodexAccounts.getProfileAccessToken,
  },
  grok: {
    id: "grok",
    list: GrokAccounts.listAccounts,
    token: GrokAccounts.getProfileAccessToken,
  },
  claude: {
    id: "claude",
    list: ClaudeAccounts.listAccounts,
    token: ClaudeAccounts.getProfileAccessToken,
  },
  antigravity: {
    id: "antigravity",
    list: AntigravityAccounts.listAccounts,
    token: AntigravityAccounts.getProfileAccessToken,
  },
  cursor: {
    id: "cursor",
    list: CursorAccounts.listAccounts,
    token: CursorAccounts.getProfileAccessToken,
  },
  kimi: {
    id: "kimi",
    list: KimiAccounts.listAccounts,
    token: KimiAccounts.getProfileAccessToken,
  },
} satisfies Record<ProviderId, AccountLookupProvider>;

export function getAccountProvider(
  provider: ProviderId,
): AccountLookupProvider {
  return ACCOUNT_PROVIDERS[provider];
}
