import type { ProviderId } from "../models";
import { getEffectiveSettings as getCodexSettings } from "../providers/codex/credentials";
import type { WidgetSettings as CodexWidgetSettings } from "../providers/codex/types";
import { getEffectiveSettings as getGrokSettings } from "../providers/grok/credentials";
import type { WidgetSettings as GrokWidgetSettings } from "../providers/grok/types";
import { getEffectiveSettings as getClaudeSettings } from "../providers/claude/credentials";
import type { WidgetSettings as ClaudeWidgetSettings } from "../providers/claude/types";
import { getEffectiveSettings as getAntigravitySettings } from "../providers/antigravity/credentials";
import type { WidgetSettings as AntigravityWidgetSettings } from "../providers/antigravity/types";
import { getEffectiveSettings as getKimiSettings } from "../providers/kimi/widget-settings";
import type { KimiWidgetSettings } from "../providers/kimi/widget-settings";
import { getEffectiveSettings as getCopilotSettings } from "../providers/copilot/widget-settings";
import type { CopilotWidgetSettings } from "../providers/copilot/widget-settings";
import { getEffectiveSettings as getZaiSettings } from "../providers/zai/widget-settings";
import type { ZaiWidgetSettings } from "../providers/zai/widget-settings";
import { getEffectiveSettings as getMinimaxSettings } from "../providers/minimax/credentials";
import type { WidgetSettings as MinimaxWidgetSettings } from "../providers/minimax/types";

export type LegacyWidgetSettings =
  | { provider: "codex"; value: CodexWidgetSettings }
  | { provider: "grok"; value: GrokWidgetSettings }
  | { provider: "claude"; value: ClaudeWidgetSettings }
  | { provider: "antigravity"; value: AntigravityWidgetSettings }
  | { provider: "cursor"; value: null }
  | { provider: "kimi"; value: KimiWidgetSettings }
  | { provider: "copilot"; value: CopilotWidgetSettings }
  | { provider: "zai"; value: ZaiWidgetSettings }
  | { provider: "minimax"; value: MinimaxWidgetSettings };

/** Extra Large remains on the pre-unification provider settings contract. */
export function getLegacyWidgetSettings(
  provider: ProviderId,
  profileId: string,
): LegacyWidgetSettings {
  if (provider === "codex") {
    return { provider, value: getCodexSettings(profileId) };
  }
  if (provider === "grok") {
    return { provider, value: getGrokSettings(profileId) };
  }
  if (provider === "claude") {
    return { provider, value: getClaudeSettings(profileId) };
  }
  if (provider === "antigravity") {
    return { provider, value: getAntigravitySettings(profileId) };
  }
  if (provider === "cursor") return { provider, value: null };
  if (provider === "kimi") {
    return { provider, value: getKimiSettings(profileId) };
  }
  if (provider === "copilot") {
    return { provider, value: getCopilotSettings(profileId) };
  }
  if (provider === "zai") {
    return { provider, value: getZaiSettings(profileId) };
  }
  return { provider, value: getMinimaxSettings(profileId) };
}
