import type { ProviderId } from "../models";
import type { PlanBadgeResolver } from "./badge-contract";
import { resolveAntigravityBadge } from "./antigravity/badge";
import { resolveClaudeBadge } from "./claude/badge";
import { resolveCodexBadge } from "./codex/badge";
import { resolveCursorBadge } from "./cursor/badge";
import { resolveGrokBadge } from "./grok/badge";
import { resolveKimiBadge } from "./kimi/badge";
import { resolveCopilotBadge } from "./copilot/badge";

const BADGE_RESOLVERS = {
  codex: resolveCodexBadge,
  grok: resolveGrokBadge,
  claude: resolveClaudeBadge,
  antigravity: resolveAntigravityBadge,
  cursor: resolveCursorBadge,
  kimi: resolveKimiBadge,
  copilot: resolveCopilotBadge,
} satisfies Record<ProviderId, PlanBadgeResolver>;

export function resolvePlanBadge(provider: ProviderId, label: string) {
  return BADGE_RESOLVERS[provider](label);
}
