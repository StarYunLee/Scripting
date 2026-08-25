import { HStack, Text } from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { ProviderLogo } from "../../components/ProviderLogo";

const linear = (light: Color[], dark: Color[]): DynamicShapeStyle => ({
  light: {
    gradient: light.map((color, index) => ({
      color,
      location: index / (light.length - 1),
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
  dark: {
    gradient: dark.map((color, index) => ({
      color,
      location: index / (dark.length - 1),
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
});

type BadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
};

function palette(label: string): BadgePalette {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (normalized === "supergrok-heavy" || normalized === "supergrokheavy")
    return {
      text: "SUPERGROK HEAVY",
      background: linear(
        ["#000000", "#064E3B", "#0F766E"],
        ["#000000", "#065F46", "#0D9488"],
      ),
      foreground: "#ECFDF5",
    };
  if (normalized === "supergrok")
    return {
      text: "SUPERGROK",
      background: linear(["#171717", "#047857"], ["#262626", "#059669"]),
      foreground: "#ECFDF5",
    };
  return {
    text: label.trim().toUpperCase() || "GROK",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  };
}

export function PlanBadge({
  label,
  small = false,
}: {
  label: string;
  small?: boolean;
}) {
  const p = palette(label);
  const text = small && p.text === "SUPERGROK HEAVY" ? "HEAVY" : p.text;
  return (
    <HStack
      spacing={small ? 5 : 6}
      padding={{ horizontal: small ? 5 : 10, vertical: small ? 3 : 4 }}
      background={p.background}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <ProviderLogo provider="grok" size={small ? 9 : 11} tint={p.foreground} />
      <Text
        fontDesign="default"
        fontWidth="standard"
        font={small ? 9 : 10}
        fontWeight="bold"
        foregroundStyle={p.foreground}
        lineLimit={1}
        minScaleFactor={1}
      >
        {text}
      </Text>
    </HStack>
  );
}
