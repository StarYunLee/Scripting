import { HStack, Text } from "scripting"

const linear = (light: string[], dark: string[]) => ({
  light: {
    gradient: light.map((color, index) => ({ color, location: index / (light.length - 1) })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
  dark: {
    gradient: dark.map((color, index) => ({ color, location: index / (dark.length - 1) })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
})

function palette(label: string) {
  const normalized = label.trim().toLowerCase().replace(/[\s_]+/g, "-")
  if (normalized === "supergrok-heavy" || normalized === "supergrokheavy") return {
    text: "SUPERGROK HEAVY",
    background: linear(["#000000", "#064E3B", "#0F766E"], ["#000000", "#065F46", "#0D9488"]),
    foreground: "#ECFDF5",
  }
  if (normalized === "supergrok") return {
    text: "SUPERGROK",
    background: linear(["#171717", "#047857"], ["#262626", "#059669"]),
    foreground: "#ECFDF5",
  }
  return {
    text: label.trim().toUpperCase() || "GROK",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  }
}

export function PlanBadge({ label, small = false }: { label: string; small?: boolean }) {
  const p = palette(label)
  const text = small && p.text === "SUPERGROK HEAVY" ? "HEAVY" : p.text
  return <HStack padding={{ horizontal: small ? 5 : 10, vertical: small ? 2 : 4 }} background={p.background} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={small ? 8 : 10} fontWeight="bold" foregroundStyle={p.foreground} lineLimit={1} minimumScaleFactor={small ? 0.72 : 1}>{text}</Text>
  </HStack>
}
