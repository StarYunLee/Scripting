import { Rectangle } from "scripting";
import type { DynamicShapeStyle, LinearGradient } from "scripting";

function layer(
  fill: DynamicShapeStyle & { light: LinearGradient; dark: LinearGradient },
) {
  return (
    <Rectangle fill={fill} ignoresSafeArea={true} allowsHitTesting={false} />
  );
}

function SystemDefaultBackground() {
  return (
    <Rectangle
      fill={{
        light: "systemGroupedBackground",
        dark: "systemGroupedBackground",
      }}
      ignoresSafeArea={true}
      allowsHitTesting={false}
    />
  );
}

function CoolBlueBackground() {
  return layer({
    light: {
      colors: ["#C8D4EE", "#C5D5EC", "#C1D6EB"],
      startPoint: "top",
      endPoint: "bottom",
    },
    dark: {
      colors: ["#2C2E4D", "#283045", "#253340"],
      startPoint: "topLeading",
      endPoint: "bottomTrailing",
    },
  });
}

export function PageBackground() {
  return <SystemDefaultBackground />;
}

export function CoolBluePageBackground() {
  return <CoolBlueBackground />;
}
