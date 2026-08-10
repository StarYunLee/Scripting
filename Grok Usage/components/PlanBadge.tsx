import { HStack, Text } from "scripting"

const dynamic = (light: string, dark: string) => ({ light, dark })

function palette(label: string) {
  if (/heavy/i.test(label)) return {
    text: "SUPERGROK HEAVY",
    background: dynamic("#301A52", "#6D3CC7"),
    foreground: dynamic("#F5E9FF", "#FFFFFF"),
    border: dynamic("#B76CFF", "#D4A4FF"),
  }
  return {
    text: "SUPERGROK",
    background: dynamic("#C9F7EE", "#123D3A"),
    foreground: dynamic("#075F57", "#8FF4E7"),
    border: dynamic("#4CD6C2", "#37AFA2"),
  }
}

export function PlanBadge({ label, small = false }: { label: string; small?: boolean }) {
  const p = palette(label)
  return <HStack padding={{ horizontal: small ? 5 : 10, vertical: small ? 2 : 4 }} background={p.background} border={{ color: p.border, width: 0.8 }} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={small ? 8 : 10} fontWeight="bold" foregroundStyle={p.foreground} lineLimit={1} minimumScaleFactor={small ? 0.72 : 1}>{p.text}</Text>
  </HStack>
}
