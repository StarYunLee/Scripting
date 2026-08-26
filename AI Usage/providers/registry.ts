import { PROVIDER_USAGE_REGISTRY } from "./registry-usage";
import { PROVIDER_AUTH_REGISTRY } from "./registry-auth";
import type { ProviderId } from "../models";
import type { ProviderCore } from "./contracts";

export const PROVIDER_REGISTRY = {
  codex: { ...PROVIDER_USAGE_REGISTRY.codex, auth: PROVIDER_AUTH_REGISTRY.codex.auth },
  grok: { ...PROVIDER_USAGE_REGISTRY.grok, auth: PROVIDER_AUTH_REGISTRY.grok.auth },
  claude: { ...PROVIDER_USAGE_REGISTRY.claude, auth: PROVIDER_AUTH_REGISTRY.claude.auth },
  antigravity: { ...PROVIDER_USAGE_REGISTRY.antigravity, auth: PROVIDER_AUTH_REGISTRY.antigravity.auth },
  cursor: { ...PROVIDER_USAGE_REGISTRY.cursor, auth: PROVIDER_AUTH_REGISTRY.cursor.auth },
  kimi: { ...PROVIDER_USAGE_REGISTRY.kimi, auth: PROVIDER_AUTH_REGISTRY.kimi.auth },
  copilot: { ...PROVIDER_USAGE_REGISTRY.copilot, auth: PROVIDER_AUTH_REGISTRY.copilot.auth },
  zai: { ...PROVIDER_USAGE_REGISTRY.zai, auth: PROVIDER_AUTH_REGISTRY.zai.auth },
  minimax: { ...PROVIDER_USAGE_REGISTRY.minimax, auth: PROVIDER_AUTH_REGISTRY.minimax.auth },
} satisfies Record<ProviderId, ProviderCore>;

export function getProvider(provider: ProviderId): ProviderCore {
  return PROVIDER_REGISTRY[provider];
}
