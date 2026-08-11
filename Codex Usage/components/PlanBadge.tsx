import { HStack, Text } from "scripting"

const dynamic = (light: string, dark: string) => ({ light, dark })
const linear = (light: string[], dark: string[] = light) => ({
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
  if (normalized === "plus") return {
    text: "PLUS",
    background: linear(["#F1F5F9", "#E4E4E7", "#CBD5E1"], ["#D4D4D8", "#94A3B8", "#71717A"]),
    foreground: "#1E293B",
  }
  if (normalized === "pro-20x") return {
    text: "PRO 20X",
    background: linear(["#FDE047", "#F59E0B", "#EA580C"], ["#FDE047", "#FBBF24", "#F97316"]),
    foreground: "#451A03",
  }
  if (normalized === "pro-5x") return {
    text: "PRO 5X",
    background: linear(["#FBBF24", "#EAB308", "#FB923C"], ["#FBBF24", "#FACC15", "#FB923C"]),
    foreground: "#451A03",
  }
  if (normalized === "pro" || normalized === "chatgptpro") return {
    text: "PRO",
    background: linear(["#FCD34D", "#FACC15", "#F59E0B"]),
    foreground: "#451A03",
  }
  if (normalized === "team") return {
    text: "TEAM",
    background: linear(["#8B5CF6", "#4F46E5"], ["#A78BFA", "#6366F1"]),
    foreground: "#FFFFFF",
  }
  if (normalized === "premium") return {
    text: "PREMIUM",
    background: linear(["#D946EF", "#9333EA"], ["#E879F9", "#A855F7"]),
    foreground: "#FFFFFF",
  }
  if (normalized === "business") return {
    text: "BUSINESS",
    background: linear(["#334155", "#0F172A"], ["#64748B", "#334155"]),
    foreground: "#FFFFFF",
  }
  if (normalized === "enterprise") return {
    text: "ENTERPRISE",
    background: linear(["#27272A", "#0F172A", "#000000"], ["#52525B", "#334155", "#18181B"]),
    foreground: "#FEF3C7",
  }
  if (normalized === "free") return {
    text: "FREE",
    background: dynamic("#F1F5F9", "rgba(255,255,255,0.10)"),
    foreground: dynamic("#64748B", "rgba(255,255,255,0.65)"),
  }
  return {
    text: label.trim().toUpperCase() || "CODEX",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  }
}

export function PlanBadge({ label, small = false }: { label: string; small?: boolean }) {
  const p = palette(label)
  return <HStack padding={{ horizontal: small ? 8 : 10, vertical: small ? 3 : 4 }} background={p.background} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={small ? 9 : 10} fontWeight="bold" foregroundStyle={p.foreground} lineLimit={1}>{p.text}</Text>
  </HStack>
}
