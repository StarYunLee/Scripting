import type { ProviderId } from "../models";

export const LOGO_BASE_NAME: Record<ProviderId, string> = {
  codex: "openai",
  grok: "grok",
  claude: "anthropic",
  antigravity: "antigravity",
  cursor: "cursor",
  kimi: "kimi",
  copilot: "copilot",
  zai: "zai",
  minimax: "minimax",
};

export function providerLogoBaseName(provider: ProviderId): string {
  return LOGO_BASE_NAME[provider];
}
