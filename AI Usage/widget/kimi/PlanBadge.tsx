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
    .replace(/^level_/, "")
    .replace(/[\s_]+/g, "-");
  if (normalized === "ultra" || normalized === "advanced")
    return {
      text: normalized.toUpperCase(),
      background: linear(["#0F172A", "#6366F1"], ["#1E293B", "#818CF8"]),
      foreground: "#EEF2FF",
    };
  if (normalized === "pro" || normalized === "intermediate")
    return {
      text: normalized === "intermediate" ? "INTERMEDIATE" : "PRO",
      background: linear(["#312E81", "#4F46E5"], ["#4338CA", "#6366F1"]),
      foreground: "#FFFFFF",
    };
  if (normalized === "basic")
    return {
      text: "BASIC",
      background: linear(["#1E3A8A", "#3B82F6"], ["#1D4ED8", "#60A5FA"]),
      foreground: "#EFF6FF",
    };
  return {
    text: label.trim().toUpperCase() || "KIMI",
    background: linear(["#111827", "#374151"], ["#1F2937", "#4B5563"]),
    foreground: "#F9FAFB",
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
  return (
    <HStack
      spacing={small ? 5 : 6}
      padding={{ horizontal: small ? 8 : 10, vertical: small ? 3 : 4 }}
      background={p.background}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <ProviderLogo provider="kimi" size={small ? 10 : 11} tint={p.foreground} />
      {p.text !== "KIMI" ? (
        <Text
          font={small ? 9 : 10}
          fontWeight="bold"
          foregroundStyle={p.foreground}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {p.text}
        </Text>
      ) : null}
    </HStack>
  );
}
