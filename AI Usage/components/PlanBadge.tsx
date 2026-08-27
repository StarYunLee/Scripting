import { HStack, Text } from "scripting";
import type { ProviderId } from "../models";
import { resolvePlanBadge } from "../providers/badge-registry";
import { ProviderLogo } from "./ProviderLogo";

const BADGE_SIZES = {
  small: { logo: 10, text: 9, spacing: 5, horizontalPadding: 8, verticalPadding: 3 },
  regular: { logo: 11, text: 10, spacing: 6, horizontalPadding: 10, verticalPadding: 4 },
} as const;

export type PlanBadgeSize = keyof typeof BADGE_SIZES;

export function PlanBadge(props: { provider: ProviderId; label: string; size?: PlanBadgeSize }) {
  const recipe = resolvePlanBadge(props.provider, props.label);
  const layout = BADGE_SIZES[props.size ?? "regular"];
  const providerText =
    props.provider === "codex" ? "CODEX" :
    props.provider === "grok" ? "GROK" :
    props.provider === "claude" ? "CLAUDE" :
    props.provider === "cursor" ? "CURSOR" :
    props.provider === "kimi" ? "KIMI" :
    props.provider === "copilot" ? "COPILOT" :
    props.provider === "zai" ? "Z.AI" :
    props.provider === "minimax" ? "MINIMAX" : "ANTIGRAVITY";
  const text = recipe.text === providerText ? "" : recipe.text;
  return (
    <HStack spacing={layout.spacing}
      padding={{ horizontal: layout.horizontalPadding, vertical: layout.verticalPadding }}
      background={recipe.background}
      clipShape={{ type: "capsule", style: "continuous" }}
      layoutPriority={1} fixedSize={true}>
      <ProviderLogo provider={props.provider} size={layout.logo}
        tint={recipe.preserveLogoColor ? undefined : recipe.foreground} />
      {text ? (
        <Text fontDesign="default" fontWidth="standard" font={layout.text} fontWeight="bold"
          foregroundStyle={recipe.foreground} lineLimit={1}
          minScaleFactor={props.size === "small" ? 0.7 : 1}>
          {text}
        </Text>
      ) : null}
    </HStack>
  );
}
