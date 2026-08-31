import type { ProviderId } from "../models";

const WATERMARK_MAP: Record<ProviderId, string> = {
  codex: "assets/watermark-chatgpt.png",
  grok: "assets/watermark-grok.png",
  claude: "assets/watermark-claude.png",
  antigravity: "assets/watermark-antigravity.png",
  cursor: "assets/watermark-cursor.png",
  kimi: "assets/watermark-kimi.png",
  copilot: "assets/watermark-copilot.png",
  zai: "assets/watermark-zai.png",
  minimax: "assets/watermark-minimax.png",
};

export function providerWatermarkPath(provider: ProviderId): string {
  return WATERMARK_MAP[provider];
}
