import { Button, HStack, Image, Script, Spacer, Text, VStack, Widget, ZStack } from "scripting"
import { RefreshCodexUsageIntent } from "../app_intents"
import { getMediumLayout } from "../services/credentials"
import { pickFocusWindow } from "../services/api"
import { formatCountdown, formatFetchedAt, formatPercent, formatResetDate } from "../services/format"
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
  tertiary: "tertiaryLabel",
  // 轨道使用独立中性灰：比 Logo 深、比主进度浅，穿过水印时仍能辨认。
  track: dynamic("#C7C8CC", "#55565C"),
  trackBorder: dynamic("rgba(0,0,0,0.07)", "rgba(255,255,255,0.10)"),
  fill: "label",
  chip: "label",
  chipText: "systemBackground",
  divider: "separator",
  warn: "systemOrange",
  watermark: dynamic("rgba(35,35,38,0.09)", "rgba(245,245,247,0.075)"),
}
type Model = {
  snapshot: UsageSnapshot | null
  focus: LimitWindow | null
  used: number
  main: string
  suffix: string
  fetched: string
  subscription: string
  planLabel: string
  resetCredits: string
  live: boolean
  detail: string
}
function modelFor(result: UsageResult, mode: DisplayMode, focusName: Props["focusWindow"]): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null
  const focus = snapshot ? pickFocusWindow(snapshot, focusName) : null
  const used = focus?.usedPercent ?? 0
  const remaining = focus?.remainingPercent ?? (focus?.usedPercent == null ? 0 : 100 - focus.usedPercent)
  return {
    snapshot, focus, used,
    main: formatPercent(mode === "remaining" ? remaining : focus?.usedPercent),
    suffix: mode === "remaining" ? "剩余" : "已用",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    subscription: snapshot?.subscriptionExpiresAt ? formatSubscriptionRemaining(snapshot.subscriptionExpiresAt) : "未提供",
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    resetCredits: snapshot?.resetCreditsAvailable == null ? "—" : `${snapshot.resetCreditsAvailable} 次`,
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
  }
}
function isSmall(family: string): boolean {
  const value = family.toLowerCase()
  return value.includes("small") && !value.includes("medium")
}
function watermarkFile(_provider: ProviderBrand): string {
  return `${Script.directory}/assets/watermark-chatgpt.png`
}
function Watermark({ provider, size }: { provider: ProviderBrand; size: number }) {
  return <Image filePath={watermarkFile(provider)} resizable scaleToFit renderingMode="template" foregroundStyle={C.watermark} frame={{ width: size, height: size }}/>
}
function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize?.width
    if (width && width > 40) return width
  } catch { /* ignore */ }
  return isSmall(family) ? 158 : 338
}
function Progress({ value, width, height = 5 }: { value: number; width: number; height?: number }) {
  const fill = Math.max(0, width * Math.max(0, Math.min(100, value)) / 100)
  return <ZStack alignment="leading" frame={{ width, height }}>
    <HStack frame={{ width, height }} background={C.track} border={{ color: C.trackBorder, width: 0.5 }} clipShape={{ type: "capsule" }}/>
    {fill > 0 ? <HStack frame={{ width: Math.max(height, fill), height }} background={C.fill} clipShape={{ type: "capsule" }}/> : null}
  </ZStack>
}
function SmallInfoRow({ icon, label, value, width }: { icon: string; label: string; value: string; width: number }) {
  return <HStack spacing={4} frame={{ width }}>
    <Image systemName={icon} resizable scaleToFit imageScale="small" foregroundStyle={C.secondary} frame={{ width: 8, height: 8 }}/>
    <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="bold" foregroundStyle={C.secondary}>{label}</Text>
    <Spacer/>
    <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="bold" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.65}>{value}</Text>
  </HStack>
}
function SmallPlanBadge({ label }: { label: string }) {
  const normalized = /team|business/i.test(label) ? "Team" : /pro/i.test(label) ? "Pro" : "Plus"
  const team = normalized === "Team"
  const pro = normalized === "Pro"
  const background = team ? dynamic("#7145E8", "#8058F2") : pro ? dynamic("#8A7138", "#705C30") : dynamic("#DDE4F1", "#3C4659")
  const foreground = team ? "#FFFFFF" : pro ? dynamic("#FFF6D6", "#FFE8A3") : dynamic("#1D2638", "#F1F4FA")
  return <HStack padding={{ horizontal: 8, vertical: 3 }} background={background} clipShape={{ type: "capsule" }}>
    <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="bold" foregroundStyle={foreground}>{normalized.toUpperCase()}</Text>
  </HStack>
}
function SmallMeta({ label, value, alignment }: { label: string; value: string; alignment: "leading" | "center" | "trailing" }) {
  return <VStack spacing={1} alignment={alignment} frame={{ width: 42 }}>
    <Text fontDesign="default" fontWidth="standard" font={7} foregroundStyle={C.secondary} lineLimit={1}>{label}</Text>
    <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="bold" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.6}>{value}</Text>
  </VStack>
}
function PlanBadge({ label, layout }: { label: string; layout: ReturnType<typeof getMediumLayout> }) {
  const normalized = /team|business/i.test(label) ? "Team" : /pro/i.test(label) ? "Pro" : "Plus"
  const team = normalized === "Team"
  const pro = normalized === "Pro"
  const background = team ? dynamic("#7145E8", "#8058F2") : pro ? dynamic("#8A7138", "#705C30") : dynamic("#DDE4F1", "#3C4659")
  const foreground = team ? "#FFFFFF" : pro ? dynamic("#FFF6D6", "#FFE8A3") : dynamic("#1D2638", "#F1F4FA")
  return <HStack
    padding={{ horizontal: layout.planHorizontal, vertical: layout.planVertical }}
    background={background}
    clipShape={{ type: "capsule" }}
  >
    <Text fontDesign="default" fontWidth="standard" font={layout.planFont} fontWeight="bold" foregroundStyle={foreground}>
      {normalized.toUpperCase()}
    </Text>
  </HStack>
}
type MetaAlignment = "leading" | "center" | "trailing"
function MetaColumn({ icon, label, value, width, layout, alignment }: { icon: string; label: string; value: string; width: number; layout: ReturnType<typeof getMediumLayout>; alignment: MetaAlignment }) {
  const stackAlignment = alignment === "center" ? "center" : alignment
  const rowAlignment = alignment === "center" ? "center" : alignment === "trailing" ? "trailing" : "leading"
  return <VStack spacing={1} alignment={stackAlignment} frame={{ width }}>
    <HStack spacing={3} frame={{ width, alignment: rowAlignment }}>
      <Image systemName={icon} resizable scaleToFit imageScale="small" foregroundStyle={C.secondary} frame={{ width: layout.footerIcon, height: layout.footerIcon }}/>
      <Text fontDesign="default" fontWidth="standard" font={layout.footerLabelFont} fontWeight="medium" foregroundStyle={C.secondary}>{label}</Text>
    </HStack>
    <HStack frame={{ width, alignment: rowAlignment }}>
      <Text fontDesign="default" fontWidth="standard" font={layout.footerValueFont} fontWeight="bold" foregroundStyle={C.primary} lineLimit={1} minimumScaleFactor={0.65}>{value}</Text>
    </HStack>
  </VStack>
}
function formatSubscriptionRemaining(iso: string): string {
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) return "未提供"
  const days = Math.max(0, Math.ceil((target - Date.now()) / 86_400_000))
  return `剩余 ${days} 天`
}
function smallLimitTitle(window: LimitWindow | null): string {
  if (window?.name === "weekly") return "每周额度"
  if (window?.name === "monthly") return "每月额度"
  if (window?.name === "five_hour") return "5小时额度"
  return "限额"
}
function resetTitle(window: LimitWindow | null): string {
  if (window?.name === "weekly") return "周重置时间"
  if (window?.name === "monthly") return "月重置时间"
  if (window?.name === "five_hour") return "5小时重置"
  return "重置时间"
}
function usageTitle(window: LimitWindow | null): string {
  if (window?.name === "five_hour") return "5小时额度"
  if (window?.name === "monthly") return "每月额度"
  if (window?.name === "weekly") return "每周额度"
  return window?.label ? `${window.label}用量` : "Codex 用量"
}
function otherWindows(snapshot: UsageSnapshot | null, focus: LimitWindow | null): LimitWindow[] {
  return snapshot ? snapshot.windows.filter(window => window.id !== focus?.id).slice(0, 2) : []
}
function SecondarySummary({ windows }: { windows: LimitWindow[] }) {
  if (!windows.length) return null
  return <HStack spacing={4}>
    <Text fontDesign="default" fontWidth="standard" font={10} foregroundStyle={C.secondary} lineLimit={1}>
      {windows.map(window => `${window.label} ${formatPercent(window.usedPercent)} · ${formatCountdown(window.resetAt)}`).join("　")}
    </Text>
    <Spacer/>
  </HStack>
}

export function UsageWidgetView({ result, family, displayMode, focusWindow, provider }: Props) {
  const model = modelFor(result, displayMode, focusWindow)
  const small = isSmall(family)
  const pad = small ? 13 : 16
  const layout = getMediumLayout()
  const barWidth = Math.max(90, displayWidth(family) - pad * 2)
  const mediumContentWidth = Math.max(180, displayWidth(family) - layout.left - layout.right)
  const metaGap = 8
  const metaColumnWidth = Math.max(58, (mediumContentWidth - metaGap * 2) / 3)
  // 保留用户已调好的底栏位置，仅将进度条到元信息行的间距增加 2pt。
  const balancedFooterY = layout.footerY + 2
  const secondary = otherWindows(model.snapshot, model.focus)

  if (small) return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: -6, bottom: -6 }}>
      <Watermark provider={provider} size={96}/>
    </HStack>
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <HStack alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 19 }}>
        <Text fontDesign="default" fontWidth="standard" font={16} fontWeight="bold" foregroundStyle={C.primary}>{smallLimitTitle(model.focus)}</Text>
        <Spacer/>
        <SmallPlanBadge label={model.planLabel}/>
      </HStack>

      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 48 }}>
        <VStack spacing={1} alignment="leading">
          <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="bold" foregroundStyle={C.secondary}>已用</Text>
          <Text fontDesign="default" fontWidth="standard" font={16} fontWeight="bold" foregroundStyle={C.primary}>{formatPercent(model.focus?.usedPercent)}</Text>
        </VStack>
        <Spacer/>
        <VStack spacing={1} alignment="trailing">
          <Text fontDesign="default" fontWidth="standard" font={9} fontWeight="bold" foregroundStyle={C.secondary}>剩余</Text>
          <Text fontDesign="default" fontWidth="standard" font={16} fontWeight="bold" foregroundStyle={C.primary}>{formatPercent(model.focus?.remainingPercent)}</Text>
        </VStack>
      </HStack>

      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, top: 87 }}>
        <Progress value={model.used} width={barWidth} height={7}/>
      </HStack>

      <VStack spacing={5} alignment="leading" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: 12, trailing: 12, top: 102 }}>
        <SmallInfoRow icon="clock" label="更新时间" value={model.fetched} width={barWidth}/>
        <SmallInfoRow icon="calendar" label="重置时间" value={formatResetDate(model.focus?.resetAt)} width={barWidth}/>
        <SmallInfoRow icon="arrow.clockwise" label="重置次数" value={model.resetCredits} width={barWidth}/>
      </VStack>

      {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 12, bottom: 2 }}><Text fontDesign="default" fontWidth="standard" font={7} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
    </ZStack>
  </ZStack>

  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
    <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomTrailing" }} padding={{ trailing: layout.watermarkRight + 1, bottom: layout.watermarkBottom + 1 }}>
      <Watermark provider={provider} size={layout.watermarkSize}/>
    </HStack>
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <HStack spacing={6} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: layout.left, top: layout.planY }}>
        <PlanBadge label={model.planLabel} layout={layout}/>
        {model.subscription !== "未提供" ? <HStack padding={{ horizontal: 8, vertical: layout.planVertical }} background={dynamic("#ECFFF7", "#163D34")} border={{ color: dynamic("#9CEBCD", "#347A68"), width: 1 }} clipShape={{ type: "capsule" }}>
          <Text fontDesign="default" fontWidth="standard" font={layout.subscriptionBadgeFont} fontWeight="semibold" foregroundStyle={dynamic("#087A5B", "#8EE3C8")}>{model.subscription}</Text>
        </HStack> : null}
      </HStack>

      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topTrailing" }} padding={{ trailing: layout.right, top: layout.topY }}>
        <HStack padding={{ horizontal: layout.chipHorizontal, vertical: layout.chipVertical }} background={C.chip} clipShape={{ type: "capsule" }}>
          <Text fontDesign="default" fontWidth="standard" font={layout.chipFont} fontWeight="semibold" foregroundStyle={C.chipText}>剩余 {formatPercent(model.focus?.remainingPercent)}</Text>
        </HStack>
      </HStack>

      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: layout.left, trailing: layout.right, top: layout.titleY }}>
        <Text fontDesign="default" fontWidth="standard" font={layout.titleFont} fontWeight="bold" foregroundStyle={C.primary}>{usageTitle(model.focus)}</Text>
        {secondary.length ? <Text fontDesign="default" fontWidth="standard" font={9} foregroundStyle={C.secondary} lineLimit={1}>　{secondary.map(w => `${w.label} ${formatPercent(w.usedPercent)}`).join(" · ")}</Text> : null}
        <Spacer/>
      </HStack>

      <HStack alignment="lastTextBaseline" spacing={7} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: layout.left, trailing: layout.right, top: layout.mainY }}>
        <Text fontDesign="default" fontWidth="standard" font={layout.mainFont} fontWeight="bold" foregroundStyle={C.primary} minimumScaleFactor={0.4}>{model.main}</Text>
        <Text fontDesign="default" fontWidth="standard" font={layout.suffixFont} fontWeight="medium" foregroundStyle={C.secondary}>{model.suffix}</Text>
        <Spacer/>
      </HStack>

      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: layout.left, top: layout.progressY }}>
        <Progress value={model.used} width={mediumContentWidth} height={layout.progressHeight}/>
      </HStack>

      <HStack spacing={metaGap} frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ leading: layout.left, trailing: layout.right, top: balancedFooterY }}>
        <MetaColumn icon="clock" label="更新时间" value={model.fetched} width={metaColumnWidth} layout={layout} alignment="leading"/>
        <MetaColumn icon="arrow.clockwise" label="重置次数" value={model.resetCredits} width={metaColumnWidth} layout={layout} alignment="center"/>
        <MetaColumn icon="calendar" label="重置时间" value={formatResetDate(model.focus?.resetAt)} width={metaColumnWidth} layout={layout} alignment="trailing"/>
      </HStack>

      {!model.live && model.detail ? <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "bottomLeading" }} padding={{ horizontal: 16, bottom: 3 }}><Text fontDesign="default" fontWidth="standard" font={9} foregroundStyle={C.warn} lineLimit={1}>{model.detail}</Text></HStack> : null}
    </ZStack>
  </ZStack>
}
