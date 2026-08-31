import { Image, Script } from "scripting";
import type { DynamicShapeStyle, ShapeStyle } from "scripting";
import type { ProviderId } from "../models";
import { providerLogoBaseName } from "./provider-logos";

export function ProviderLogo(props: {
  provider: ProviderId;
  size?: number;
  tint?: ShapeStyle | DynamicShapeStyle;
}) {
  const name = providerLogoBaseName(props.provider);
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
