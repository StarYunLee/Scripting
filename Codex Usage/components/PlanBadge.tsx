import { HStack, Text } from "scripting"

const dynamic = (light: string, dark: string) => ({ light, dark })

function palette(label: string) {
  if (/team|business/i.test(label)) return {
    text: "TEAM",
    background: dynamic("#7145E8", "#8058F2"),
    foreground: "#FFFFFF",
    border: dynamic("#5933C7", "#9B7AF7"),
  }
  if (/pro/i.test(label)) return {
    text: "PRO",
    background: dynamic("#8A7138", "#705C30"),
    foreground: dynamic("#FFF6D6", "#FFE8A3"),
    border: dynamic("#B79A52", "#8A7138"),
  }
  return {
    text: "PLUS",
    background: dynamic("#DDE4F1", "#3C4659"),
    foreground: dynamic("#1D2638", "#F1F4FA"),
    border: dynamic("#9AA8BF", "#64748B"),
  }
}

export function PlanBadge({ label, small = false }: { label: string; small?: boolean }) {
  const p = palette(label)
  return <HStack padding={{ horizontal: small ? 8 : 10, vertical: small ? 3 : 4 }} background={p.background} border={{ color: p.border, width: 0.8 }} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={small ? 9 : 10} fontWeight="bold" foregroundStyle={p.foreground} lineLimit={1}>{p.text}</Text>
  </HStack>
}
