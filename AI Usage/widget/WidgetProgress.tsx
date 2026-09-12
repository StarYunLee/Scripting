import { Capsule, HStack, ZStack } from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { usageTint } from "../services/usage-colors";
import type { WidgetChromeStyle } from "./chrome-style";

const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});

const TRACK = dynamic("#C7C8CC", "#55565C");
const TRACK_BORDER = dynamic("rgba(0,0,0,0.07)", "rgba(255,255,255,0.10)");
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

  return (
    <ZStack alignment="leading" frame={{ width: props.width, height }}>
      <HStack
        frame={{ width: props.width, height }}
        background={TRACK}
        border={{ style: TRACK_BORDER, width: 0.5 }}
        clipShape={CLIP}
      />
      {fillWidth > 0 ? (
        <HStack
          frame={{ width: fillWidth, height }}
          background={usageTint(props.usedPercent, props.remainingPercent)}
          clipShape={CLIP}
        />
      ) : null}
    </ZStack>
  );
}
