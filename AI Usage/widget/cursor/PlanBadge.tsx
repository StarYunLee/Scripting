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
  const normalized = label.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "ultra")
    return {
      text: "ULTRA",
      background: linear(["#111827", "#7C3AED"], ["#1F2937", "#8B5CF6"]),
      foreground: "#F5F3FF",
    };
  if (normalized === "pro")
    return {
      text: "PRO",
      background: linear(["#1E293B", "#0EA5E9"], ["#334155", "#38BDF8"]),
      foreground: "#F8FAFC",
    };
  if (normalized === "team" || normalized === "business")
    return {
      text: normalized.toUpperCase(),
      background: linear(["#312E81", "#4F46E5"], ["#4338CA", "#6366F1"]),
      foreground: "#FFFFFF",
    };
  if (normalized === "enterprise")
    return {
      text: "ENTERPRISE",
      background: linear(["#0F172A", "#334155"], ["#1E293B", "#475569"]),
      foreground: "#F8FAFC",
    };
  return {
    text: label.trim().toUpperCase() || "CURSOR",
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
      <ProviderLogo provider="cursor" size={small ? 10 : 11} tint={p.foreground} />
      {p.text !== "CURSOR" ? (
        <Text
          fontDesign="default"
          fontWidth="standard"
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
