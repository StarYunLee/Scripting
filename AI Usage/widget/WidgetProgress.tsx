import { Capsule, HStack, ZStack } from "scripting";
import { usageSeverity } from "../services/usage-colors";
import type { WidgetChromeStyle } from "./chrome-style";
import { widgetTheme } from "./transparent";

const CLIP = { type: "capsule" as const, style: "continuous" as const };

export function WidgetProgress(props: {
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
  height?: number;
  chromeStyle?: WidgetChromeStyle;
}) {
  const height = props.height ?? 7;
  const shown =
    props.remainingPercent == null
      ? null
      : Math.max(0, Math.min(100, props.remainingPercent));
  const fill = shown == null ? 0 : (props.width * shown) / 100;
  const fillWidth = fill > 0 ? Math.max(height, fill) : 0;
  const clearHomeScreen = props.chromeStyle === "clear";
  const palette = widgetTheme.current;

  if (clearHomeScreen) {
    return (
      <ZStack alignment="leading" frame={{ width: props.width, height }}>
        <Capsule
          frame={{ width: props.width, height }}
          stroke={{
            shapeStyle: "secondaryLabel",
            strokeStyle: { lineWidth: 1 },
          }}
        />
        {fillWidth > 0 ? (
          <HStack
            frame={{ width: fillWidth, height }}
            background="label"
            clipShape={CLIP}
          />
        ) : null}
      </ZStack>
    );
  }

  const severity = usageSeverity(props.usedPercent, props.remainingPercent);
  const tint =
    severity === "critical"
      ? palette.progressCritical
      : severity === "warning"
        ? palette.progressWarning
        : palette.progressNormal;

  return (
    <ZStack alignment="leading" frame={{ width: props.width, height }}>
      <HStack
        frame={{ width: props.width, height }}
        background={palette.track}
        {...(palette.trackBorder !== "clear"
          ? { border: { style: palette.trackBorder, width: 0.5 } }
          : {})}
        clipShape={CLIP}
      />
      {fillWidth > 0 ? (
        <HStack
          frame={{ width: fillWidth, height }}
          background={tint}
          clipShape={CLIP}
        />
      ) : null}
    </ZStack>
  );
}
