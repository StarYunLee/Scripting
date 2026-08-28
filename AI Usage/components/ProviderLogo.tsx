import { Image, Script } from "scripting";
import type { DynamicShapeStyle, ShapeStyle } from "scripting";
import type { ProviderId } from "../models";

function logoBaseName(provider: ProviderId): string {
  if (provider === "codex") return "openai";
  if (provider === "grok") return "grok";
  if (provider === "claude") return "anthropic";
  if (provider === "cursor") return "cursor";
  if (provider === "kimi") return "kimi";
  if (provider === "copilot") return "copilot";
  if (provider === "zai") return "zai";
  return "antigravity";
}

export function ProviderLogo(props: {
  provider: ProviderId;
  size?: number;
  tint?: ShapeStyle | DynamicShapeStyle;
}) {
  const name = logoBaseName(props.provider);
  const size = props.size ?? 18;
  return (
    <Image
      filePath={{
        light: `${Script.directory}/assets/${name}-light.png`,
        dark: `${Script.directory}/assets/${name}-dark.png`,
      }}
      resizable
      scaleToFit
      renderingMode={props.tint ? "template" : undefined}
      foregroundStyle={props.tint}
      frame={{ width: size, height: size }}
    />
  );
}
