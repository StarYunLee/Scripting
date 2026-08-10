import { HStack, Image, Script, Spacer, Text, VStack, Widget, ZStack } from "scripting"
import { pickFocusWindow } from "../services/api"
import { formatPercent, formatResetDate } from "../services/format"
import type { DisplayMode, DualQuotaPreset, FocusWindow, LimitWindow, UsageResult, UsageSnapshot, WidgetStyle } from "../services/types"

type Props = {
  result: UsageResult
  family: string
  displayMode: DisplayMode
  focusWindow: FocusWindow
  widgetStyle: WidgetStyle
  dualQuotaPreset: DualQuotaPreset
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
  fiveHour: LimitWindow | null
  weekly: LimitWindow | null
  weeklyFable: LimitWindow | null
  planLabel: string
  fetched: string
  live: boolean
  detail: string
}
function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null
  return {
    snapshot,
    fiveHour: snapshot?.fiveHour || snapshot?.windows.find(w => w.name === "five_hour") || null,
    weekly: snapshot?.weekly || snapshot?.windows.find(w => w.name === "weekly") || null,
    weeklyFable: snapshot?.weeklyFable || snapshot?.windows.find(w => w.name === "weekly_fable") || null,
    planLabel: snapshot?.planLabel || snapshot?.planType || "Claude",
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
function Watermark({ size }: { size: number }) {
  return <Image filePath={`${Script.directory}/assets/watermark-claude.png`} resizable scaleToFit renderingMode="template" foregroundStyle={C.watermark} frame={{ width: size, height: size }}/>
}
function Progress({ value, width, height }: { value: number; width: number; height: number }) {
  const used = Math.max(0, Math.min(100, value))
  const fill = width * used / 100
  return <ZStack alignment="leading" frame={{ width, height }}>
    <HStack frame={{ width, height }} background={C.track} border={{ color: C.trackBorder, width: 0.5 }} clipShape={{ type: "capsule" }}/>
    {fill > 0 ? <HStack frame={{ width: Math.max(height, fill), height }} background={C.fill} clipShape={{ type: "capsule" }}/> : null}
  </ZStack>
}
function compactPlanLabel(label: string): string {
  const value = label.replace(/DEMO\s*[·•|-]?\s*/i, "").trim()
  if (/max\s*20\s*[×x]/i.test(value)) return "Max 20×"
  if (/max\s*5\s*[×x]/i.test(value)) return "Max 5×"
  if (/\bpro\b/i.test(value)) return "Pro"
  return value.replace(/^claude\s+/i, "") || "Claude"
}
function badgePalette(label: string, small = false) {
  const text = small ? compactPlanLabel(label) : label
  const max = /max/i.test(text)
  return max
    ? { text, background: dynamic("#F3DDD2", "#5A2F22"), foreground: dynamic("#8C321B", "#FFD9C8"), border: dynamic("#D97757", "#D97757") }
    : { text, background: dynamic("#F2E8E3", "#3F302B"), foreground: dynamic("#6B3C2C", "#F2C9B9"), border: dynamic("#C98A72", "#B66C50") }
}
function PlanBadge({ label, small = false }: { label: string; small?: boolean }) {
  const p = badgePalette(label, small)
  return <HStack padding={{ horizontal: small ? 5 : 10, vertical: small ? 2 : 4 }} background={p.background} border={{ color: p.border, width: 0.8 }} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={small ? 8 : 10} fontWeight="bold" foregroundStyle={p.foreground} lineLimit={1} minimumScaleFactor={small ? 0.72 : 1}>{p.text}</Text>
  </HStack>
}
function shownPercent(window: LimitWindow | null, mode: DisplayMode): string {
  return formatPercent(mode === "remaining" ? window?.remainingPercent : window?.usedPercent)
}
function modeLabel(mode: DisplayMode): string { return mode === "remaining" ? "剩余" : "已用" }
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
function MediumWindow({ title, window, mode, width, top }: { title: string; window: LimitWindow | null; mode: DisplayMode; width: number; top: number }) {
  return <>
    <HStack alignment="lastTextBaseline" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, trailing: 20, top }}>
      <Text fontDesign="default" fontWidth="standard" font={15} fontWeight="bold" foregroundStyle={C.primary}>{title}</Text>
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

function singleWindowTitle(window: LimitWindow | null): string {
  if (window?.name === "five_hour") return "5 小时额度"
  if (window?.name === "weekly") return "7 天额度"
  if (window?.name === "weekly_fable") return "Fable 7 天周限"
  return window?.label || "Claude 用量"
}
function SingleInfoRow({ icon, label, value, width }: { icon: string; label: string; value: string; width: number }) {
  return <HStack spacing={4} frame={{ width }}>
    <Image systemName={icon} resizable scaleToFit imageScale="small" foregroundStyle={C.secondary} frame={{ width: 8, height: 8 }}/>
    <Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>{label}</Text>
    <Spacer/>
    <Text font={9} fontWeight="bold" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.65}>{value}</Text>
  </HStack>
}
function SingleWindowView({ model, family, displayMode, focusWindow }: { model: Model; family: string; displayMode: DisplayMode; focusWindow: FocusWindow }) {
  const small = isSmall(family)
  const width = displayWidth(family)
  const focus = model.snapshot ? pickFocusWindow(model.snapshot, focusWindow) : null
  const used = focus?.usedPercent ?? 0
  const shown = displayMode === "remaining" ? focus?.remainingPercent : focus?.usedPercent
  const title = singleWindowTitle(focus)
  const barWidth = Math.max(90, width - (small ? 24 : 40))

  if (small) return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -6, bottom: -6 }}><Watermark size={96}/></HStack>
    <HStack alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 19 }}>
      <Text font={16} fontWeight="bold" foregroundStyle={C.primary}>{title}</Text><Spacer/><PlanBadge label={model.planLabel} small/>
    </HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 48 }}>
      <VStack spacing={1} alignment="leading"><Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>已用</Text><Text font={16} fontWeight="bold" foregroundStyle={C.primary}>{formatPercent(focus?.usedPercent)}</Text></VStack>
      <Spacer/>
      <VStack spacing={1} alignment="trailing"><Text font={9} fontWeight="bold" foregroundStyle={C.secondary}>剩余</Text><Text font={16} fontWeight="bold" foregroundStyle={C.primary}>{formatPercent(focus?.remainingPercent)}</Text></VStack>
    </HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, top: 87 }}><Progress value={used} width={barWidth} height={7}/></HStack>
    <VStack spacing={6} alignment="leading" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 103 }}>
      <SingleInfoRow icon="clock" label="更新时间" value={model.fetched} width={barWidth}/>
      <SingleInfoRow icon="calendar" label="重置时间" value={formatResetDate(focus?.resetAt)} width={barWidth}/>
    </VStack>
    {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 12, bottom: 2 }}><Text font={7} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
  </ZStack>

  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -8, bottom: -12 }}><Watermark size={140}/></HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, top: 9 }}><PlanBadge label={model.planLabel}/></HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topTrailing" }} padding={{ trailing: 20, top: 10 }}>
      <HStack padding={{ horizontal: 10, vertical: 6 }} background={C.primary} clipShape={{ type: "capsule" }}><Text font={12} fontWeight="semibold" foregroundStyle={C.bg}>剩余 {formatPercent(focus?.remainingPercent)}</Text></HStack>
    </HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, top: 38 }}><Text font={17} fontWeight="bold" foregroundStyle={C.primary}>{title}</Text></HStack>
    <HStack alignment="lastTextBaseline" spacing={7} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, top: 59 }}>
      <Text font={40} fontWeight="bold" foregroundStyle={C.primary} minimumScaleFactor={0.4}>{formatPercent(shown)}</Text><Text font={12} fontWeight="medium" foregroundStyle={C.secondary}>{modeLabel(displayMode)}</Text>
    </HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, top: 110 }}><Progress value={used} width={barWidth} height={7}/></HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, trailing: 20, top: 124 }}>
      <VStack spacing={1} alignment="leading"><Text font={10} foregroundStyle={C.secondary}>更新时间</Text><Text font={12} fontWeight="bold" foregroundStyle={C.primary}>{model.fetched}</Text></VStack>
      <Spacer/>
      <VStack spacing={1} alignment="trailing"><Text font={10} foregroundStyle={C.secondary}>重置时间</Text><Text font={12} fontWeight="bold" foregroundStyle={C.primary}>{formatResetDate(focus?.resetAt)}</Text></VStack>
    </HStack>
    {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 20, bottom: 2 }}><Text font={8} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
  </ZStack>
}

export function UsageWidgetView({ result, family, displayMode, focusWindow, widgetStyle, dualQuotaPreset }: Props) {
  const model = modelFor(result)
  if (widgetStyle === "single") return <SingleWindowView model={model} family={family} displayMode={displayMode} focusWindow={focusWindow}/>
  const firstWindow = dualQuotaPreset === "weekly_fable" ? model.weekly : model.fiveHour
  const secondWindow = dualQuotaPreset === "weekly_fable" ? model.weeklyFable : model.weekly
  const firstTitle = dualQuotaPreset === "weekly_fable" ? "每周额度" : "5 小时额度"
  const secondTitle = dualQuotaPreset === "weekly_fable" ? "Fable 每周额度" : "每周额度"
  const small = isSmall(family)
  const width = displayWidth(family)

  if (small) {
    const contentWidth = Math.max(112, width - 24)
    return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -9, bottom: -9 }}><Watermark size={100}/></HStack>
      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 18 }}>
        <PlanBadge label={model.planLabel} small/><Spacer/>
        <Text fontDesign="default" fontWidth="standard" font={8} fontWeight="medium" foregroundStyle={C.secondary}>{model.fetched}</Text>
      </HStack>
      <SmallWindow title={firstTitle} window={firstWindow} mode={displayMode} width={contentWidth} top={43}/>
      <SmallWindow title={secondTitle} window={secondWindow} mode={displayMode} width={contentWidth} top={99}/>
      {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 12, bottom: 2 }}><Text font={7} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
    </ZStack>
  }

  const contentWidth = Math.max(220, width - 40)
  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -11, bottom: -13 }}><Watermark size={145}/></HStack>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 20, trailing: 20, top: 9 }}>
      <PlanBadge label={model.planLabel}/><Spacer/>
      <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="medium" foregroundStyle={C.secondary}>更新 {model.fetched}</Text>
    </HStack>
    <MediumWindow title={firstTitle} window={firstWindow} mode={displayMode} width={contentWidth} top={38}/>
    <MediumWindow title={secondTitle} window={secondWindow} mode={displayMode} width={contentWidth} top={96}/>
    {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 20, bottom: 2 }}><Text font={8} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
  </ZStack>
}
