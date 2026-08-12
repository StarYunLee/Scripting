import { Button, HStack, Image, Script, Spacer, Text, VStack, ZStack } from "scripting"
import { RefreshSurgeMetricsIntent } from "../app_intents"
import { formatBytes, formatFetchedAt, shortPolicyName } from "../services/format"
import type { PolicyTraffic } from "../services/types"

const dynamic = (light: string, dark: string) => ({ light, dark })

export const C = {
  bg: "systemBackground",
  primary: "label",
  secondary: "secondaryLabel",
  tertiary: "tertiaryLabel",
  accent: dynamic("#0A84FF", "#64D2FF"),
  down: dynamic("#30D158", "#30D158"),
  up: dynamic("#FF9F0A", "#FF9F0A"),
  warn: "systemOrange",
  track: dynamic("#E5E5EA", "#3A3A3C"),
  chip: dynamic("rgba(10,132,255,0.12)", "rgba(100,210,255,0.16)"),
}

function normalizedBuildLabel(value: string): string {
  let raw = String(value || "").trim()
  if (!raw) return "Surge —"

  // Strip the platform prefix from new and cached snapshots.
  raw = raw.replace(/^(?:iOS|macOS|Mac)\s*•\s*/i, "")
  if (/^Surge\s+/i.test(raw)) {
    return raw.replace(/^surge/i, "Surge")
  }

  // Backward compatibility with cached snapshots such as:
  // "5.102.0 · 3813" or "Version 5.102.0 · 3813".
  const legacy = raw.match(/^(?:Version\s+)?([^·•]+?)(?:\s*[·•]\s*(?:Build\s+)?(.+))?$/i)
  if (legacy) {
    const version = legacy[1].trim()
    const build = legacy[2]?.trim()
    return build
      ? `Surge ${version} • Build ${build}`
      : `Surge ${version}`
  }
  return `Surge ${raw}`
}

export function Header({ fetchedAt, cached }: { fetchedAt: string; cached: boolean }) {
  const updated = `${cached ? "缓存" : "更新"} ${formatFetchedAt(fetchedAt)}`
  return <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
    <HStack spacing={5} alignment="center" padding={{ horizontal: 8, vertical: 4 }} background={C.chip} clipShape={{ type: "capsule" }}>
      <Image filePath={`${Script.directory}/assets/surge-metrics-icon.png`} resizable scaleToFit frame={{ width: 15, height: 15 }}/>
      <Text font={11} fontWeight="bold" foregroundStyle={C.accent}>Surge</Text>
    </HStack>
    <Spacer/>
    <HStack spacing={7} alignment="center">
      <Text font={10} fontWeight="medium" foregroundStyle={C.tertiary} lineLimit={1}>{updated}</Text>
      <Button intent={RefreshSurgeMetricsIntent(undefined)} buttonStyle="plain">
        <Image systemName="arrow.clockwise" foregroundStyle={C.accent} frame={{ width: 13, height: 13 }}/>
      </Button>
    </HStack>
  </HStack>
}

export function VersionLabel({ value }: { value: string }) {
  return <Text font={9} fontWeight="medium" foregroundStyle={C.tertiary} lineLimit={1} minimumScaleFactor={0.7}>{normalizedBuildLabel(value)}</Text>
}

export function RateCard({ icon, label, value, color }: {
  icon: string
  label: string
  value: string
  color: string | { light: string; dark: string }
}) {
  return <VStack spacing={3} alignment="leading" padding={{ horizontal: 5, vertical: 5 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack spacing={5} alignment="center">
      <Image systemName={icon} resizable scaleToFit foregroundStyle={color} frame={{ width: 11, height: 11 }}/>
      <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>{label}</Text>
    </HStack>
    <Text font={22} fontWeight="bold" fontDesign="rounded" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.58}>{value}</Text>
  </VStack>
}

export function StatusBlock({ icon, label, value, color }: {
  icon: string
  label: string
  value: string
  color?: string | { light: string; dark: string }
}) {
  return <VStack spacing={3} alignment="center" frame={{ maxWidth: "infinity", alignment: "center" }}>
    <HStack spacing={4} alignment="center">
      <Image systemName={icon} resizable scaleToFit foregroundStyle={color || C.secondary} frame={{ width: 12, height: 12 }}/>
      <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>{label}</Text>
    </HStack>
    <Text font={13} fontWeight="bold" fontDesign="rounded" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.68}>{value}</Text>
  </VStack>
}

function policyWeight(item: PolicyTraffic): number {
  return Math.max(0, item.totalBytes)
}

export function PolicyRow({ item, maxWeight, barWidth }: { item: PolicyTraffic; maxWeight: number; barWidth: number }) {
  const weight = policyWeight(item)
  const ratio = maxWeight > 0 ? Math.max(0.035, Math.min(1, weight / maxWeight)) : 0
  const fill = Math.max(4, Math.round(barWidth * ratio))
  const value = formatBytes(item.totalBytes)
  return <VStack spacing={3} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
      <Text font={11} fontWeight="semibold" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.75}>{shortPolicyName(item.name, 22)}</Text>
      <Spacer/>
      <Text font={11} fontWeight="bold" fontDesign="rounded" foregroundStyle={C.secondary} lineLimit={1}>{value}</Text>
    </HStack>
    <ZStack alignment="leading" frame={{ width: barWidth, height: 4 }}>
      <HStack frame={{ width: barWidth, height: 4 }} background={C.track} clipShape={{ type: "capsule" }}/>
      <HStack frame={{ width: fill, height: 4 }} background={C.accent} clipShape={{ type: "capsule" }}/>
    </ZStack>
  </VStack>
}

export function maxPolicyWeight(items: PolicyTraffic[]): number {
  return Math.max(1, ...items.map(policyWeight))
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <VStack spacing={6} alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={16}>
    <Image systemName="speedometer" foregroundStyle={C.secondary} frame={{ width: 28, height: 28 }}/>
    <Text font={14} fontWeight="bold" foregroundStyle={C.primary}>{title}</Text>
    {detail ? <Text font={11} foregroundStyle={C.secondary} multilineTextAlignment="center" lineLimit={3}>{detail}</Text> : null}
  </VStack>
}
