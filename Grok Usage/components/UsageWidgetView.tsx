import { HStack, Image, Script, Spacer, Text, Widget, ZStack } from "scripting"
import { formatPercent, formatResetDate } from "../services/format"
import type { DisplayMode, LimitWindow, ProviderBrand, UsageResult, UsageSnapshot } from "../services/types"

type Props = {
  result: UsageResult
  family: string
  displayMode: DisplayMode
  focusWindow: "weekly" | "five_hour" | "monthly" | "auto"
  provider: ProviderBrand
}

const dynamic = (light: string, dark: string) => ({ light, dark })
const C = {
  bg: "systemBackground",
  primary: "label",
  secondary: "secondaryLabel",
  track: dynamic("#C7C8CC", "#55565C"),
  trackBorder: dynamic("rgba(0,0,0,0.07)", "rgba(255,255,255,0.10)"),
  fill: "label",
  warn: "systemOrange",
  watermark: dynamic("rgba(35,35,38,0.065)", "rgba(245,245,247,0.06)"),
}

type Model = {
  snapshot: UsageSnapshot | null
  weekly: LimitWindow | null
  monthly: LimitWindow | null
  planLabel: string
  fetched: string
  live: boolean
  detail: string
}
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null
  return {
    snapshot,
    weekly: snapshot?.weekly || snapshot?.windows.find(w => w.name === "weekly") || null,
    monthly: snapshot?.monthly || snapshot?.windows.find(w => w.name === "monthly") || null,
    planLabel: snapshot?.planLabel || snapshot?.planType || "SuperGrok",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
  }
}
function isSmall(family: string): boolean {
  const value = family.toLowerCase()
  return value.includes("small") && !value.includes("medium")
}
function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize?.width
    if (width && width > 40) return width
  } catch { /* ignore */ }
  return isSmall(family) ? 158 : 338
}
function Watermark({ provider: _provider, size }: { provider: ProviderBrand; size: number }) {
  return <Image filePath={`${Script.directory}/assets/watermark-grok.png`} resizable scaleToFit renderingMode="template" foregroundStyle={C.watermark} frame={{ width: size, height: size }}/>
}
function Progress({ value, width, height }: { value: number; width: number; height: number }) {
  const used = Math.max(0, Math.min(100, value))
  const fill = width * used / 100
  return <ZStack alignment="leading" frame={{ width, height }}>
    <HStack frame={{ width, height }} background={C.track} border={{ color: C.trackBorder, width: 0.5 }} clipShape={{ type: "capsule" }}/>
    {fill > 0 ? <HStack frame={{ width: Math.max(height, fill), height }} background={C.fill} clipShape={{ type: "capsule" }}/> : null}
  </ZStack>
}
function badgePalette(label: string) {
  const heavy = /heavy|pro/i.test(label)
  return heavy
    ? { text: "SUPERGROK HEAVY", background: dynamic("#301A52", "#6D3CC7"), foreground: dynamic("#F5E9FF", "#FFFFFF"), border: dynamic("#B76CFF", "#D4A4FF") }
    : { text: "SUPERGROK", background: dynamic("#C9F7EE", "#123D3A"), foreground: dynamic("#075F57", "#8FF4E7"), border: dynamic("#4CD6C2", "#37AFA2") }
}
function PlanBadge({ label, small = false }: { label: string; small?: boolean }) {
  const p = badgePalette(label)
  return <HStack padding={{ horizontal: small ? 5 : 10, vertical: small ? 2 : 4 }} background={p.background} border={{ color: p.border, width: 0.8 }} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={small ? 8 : 10} fontWeight="bold" foregroundStyle={p.foreground} lineLimit={1} minimumScaleFactor={small ? 0.72 : 1}>{p.text}</Text>
  </HStack>
}
function shownPercent(window: LimitWindow | null, mode: DisplayMode): string {
  return formatPercent(mode === "remaining" ? window?.remainingPercent : window?.usedPercent)
}
function modeLabel(mode: DisplayMode): string { return mode === "remaining" ? "剩余" : "已用" }
function credits(window: LimitWindow | null): string {
  if (window?.usedValue == null || window.limitValue == null) return "Credits —"
  return `${Math.round(window.usedValue).toLocaleString()} / ${Math.round(window.limitValue).toLocaleString()} Credits`
}
function SmallReset({ value }: { value: string }) {
  return <HStack alignment="center" spacing={3}>
    <Image systemName="calendar" resizable scaleToFit imageScale="small" foregroundStyle={C.secondary} frame={{ width: 9, height: 9 }}/>
    <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="medium" foregroundStyle={C.secondary}>重置</Text>
    <Text fontDesign="default" fontWidth="standard" font={10} fontWeight="bold" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.7}>{value}</Text>
  </HStack>
}
function SmallWindow({ title, window, mode, width, top }: { title: string; window: LimitWindow | null; mode: DisplayMode; width: number; top: number }) {
  return <>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top }}>
      <Text fontDesign="default" fontWidth="standard" font={12} fontWeight="bold" foregroundStyle={C.primary}>{title}</Text>
      <Spacer/>
      <HStack alignment="center" spacing={3}>
        <Image systemName="chart.pie.fill" resizable scaleToFit imageScale="small" foregroundStyle={C.primary} frame={{ width: 10, height: 10 }}/>
        <Text fontDesign="default" fontWidth="standard" font={11} fontWeight="bold" foregroundStyle={C.primary}>{modeLabel(mode)} {shownPercent(window, mode)}</Text>
      </HStack>
    </HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, top: top + 20 }}>
      <Progress value={window?.usedPercent ?? 0} width={width} height={5}/>
    </HStack>
    <HStack alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: top + 30 }}>
      <SmallReset value={formatResetDate(window?.resetAt)}/>
    </HStack>
  </>
}
function MediumReset({ value }: { value: string }) {
  return <HStack alignment="center" spacing={3}>
    <Image systemName="calendar" resizable scaleToFit imageScale="small" foregroundStyle={C.secondary} frame={{ width: 10, height: 10 }}/>
    <Text fontDesign="default" fontWidth="standard" font={10} fontWeight="medium" foregroundStyle={C.secondary}>重置</Text>
    <Text fontDesign="default" fontWidth="standard" font={12} fontWeight="bold" foregroundStyle={C.primary} lineLimit={1}>{value}</Text>
  </HStack>
}
function MediumWindow({ title, window, mode, width, top, monthly = false }: { title: string; window: LimitWindow | null; mode: DisplayMode; width: number; top: number; monthly?: boolean }) {
  return <>
    <HStack alignment="lastTextBaseline" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, trailing: 20, top }}>
      <Text fontDesign="default" fontWidth="standard" font={15} fontWeight="bold" foregroundStyle={C.primary}>{title}</Text>
      {monthly ? <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="medium" foregroundStyle={C.secondary} lineLimit={1}>　{credits(window)}</Text> : null}
      <Spacer/>
      <HStack alignment="center" spacing={4}>
        <Image systemName="chart.pie.fill" resizable scaleToFit imageScale="small" foregroundStyle={C.primary} frame={{ width: 12, height: 12 }}/>
        <Text fontDesign="default" fontWidth="standard" font={14} fontWeight="bold" foregroundStyle={C.primary}>{modeLabel(mode)} {shownPercent(window, mode)}</Text>
      </HStack>
    </HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, top: top + 24 }}>
      <Progress value={window?.usedPercent ?? 0} width={width} height={7}/>
    </HStack>
    <HStack alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, top: top + 36 }}>
      <MediumReset value={formatResetDate(window?.resetAt)}/>
    </HStack>
  </>
}

export function UsageWidgetView({ result, family, displayMode, provider }: Props) {
  const model = modelFor(result)
  const small = isSmall(family)
  const width = displayWidth(family)

  if (small) {
    const contentWidth = Math.max(112, width - 24)
    return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -9, bottom: -9 }}><Watermark provider={provider} size={100}/></HStack>
      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 18 }}>
        <PlanBadge label={model.planLabel} small/><Spacer/>
        <Text fontDesign="default" fontWidth="standard" font={8} fontWeight="medium" foregroundStyle={C.secondary}>{model.fetched}</Text>
      </HStack>
      <SmallWindow title="每周额度" window={model.weekly} mode={displayMode} width={contentWidth} top={43}/>
      <SmallWindow title="每月额度" window={model.monthly} mode={displayMode} width={contentWidth} top={99}/>
      {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 12, bottom: 2 }}><Text font={7} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
    </ZStack>
  }

  const contentWidth = Math.max(220, width - 40)
  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -11, bottom: -13 }}><Watermark provider={provider} size={145}/></HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, trailing: 20, top: 9 }}>
      <PlanBadge label={model.planLabel}/><Spacer/>
      <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="medium" foregroundStyle={C.secondary}>更新 {model.fetched}</Text>
    </HStack>
    <MediumWindow title="每周额度" window={model.weekly} mode={displayMode} width={contentWidth} top={38}/>
    <MediumWindow title="每月额度" window={model.monthly} mode={displayMode} width={contentWidth} top={96} monthly/>
    {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 20, bottom: 2 }}><Text font={8} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
  </ZStack>
}
