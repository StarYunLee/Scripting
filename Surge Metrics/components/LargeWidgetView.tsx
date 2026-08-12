import { HStack, Spacer, Text, VStack, Widget, ZStack } from "scripting"
import { formatBytes, formatMemory, formatUptime } from "../services/format"
import type { MetricsResult, MetricsSnapshot } from "../services/types"
import { C, EmptyState, Header, maxPolicyWeight, PolicyRow, RateCard, StatusBlock, VersionLabel } from "./WidgetPrimitives"

type Props = { result: MetricsResult; maxPolicies?: number }

function snapshotOf(result: MetricsResult): MetricsSnapshot | null {
  return result.ok ? result.snapshot : result.cache || null
}

function displayWidth(): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize?.width
    if (width && width > 40) return width
  } catch { /* ignore */ }
  return 338
}

export function LargeWidgetView({ result, maxPolicies = 5 }: Props) {
  const snapshot = snapshotOf(result)
  const live = result.ok
  const errorText = result.ok ? "" : result.error.message

  if (!snapshot) {
    return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
      <EmptyState title={result.ok ? "暂无数据" : "尚未配置"} detail={result.ok ? "等待下一次刷新" : errorText || "打开脚本填写 Surge HTTP API"}/>
    </ZStack>
  }

  const policies = (snapshot.topPolicies || []).slice(0, Math.max(1, Math.min(maxPolicies, 5)))
  const maxWeight = maxPolicyWeight(policies)
  const barWidth = Math.max(220, displayWidth() - 36)
  const down = formatBytes(snapshot.totalInBytes)
  const up = formatBytes(snapshot.totalOutBytes)
  const mem = formatMemory(snapshot.memoryBytes)
  const active = snapshot.activeRequests == null ? "—" : String(Math.round(snapshot.activeRequests))
  const dns = snapshot.dnsCacheEntries == null ? "—" : String(Math.round(snapshot.dnsCacheEntries))
  const uptime = formatUptime(snapshot.uptimeSeconds)

  return <VStack spacing={0} alignment="leading" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ horizontal: 18, vertical: 13 }} widgetBackground={C.bg}>
    <Header fetchedAt={snapshot.fetchedAt} cached={!live}/>

    <HStack spacing={9} alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 10 }}>
      <RateCard icon="arrow.down.circle.fill" label="累计下行" value={down} color={C.down}/>
      <HStack frame={{ width: 1, height: 43 }} background={C.track}/>
      <RateCard icon="arrow.up.circle.fill" label="累计上行" value={up} color={C.up}/>
    </HStack>

    <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 9, bottom: 8 }}>
      <StatusBlock icon="cpu" label="内存占用" value={mem} color={C.accent}/>
      <Spacer/>
      <StatusBlock icon="link" label="活跃请求" value={active}/>
      <Spacer/>
      <StatusBlock icon="globe" label="DNS 缓存" value={dns}/>
      <Spacer/>
      <StatusBlock icon="clock" label="运行时长" value={uptime}/>
    </HStack>

    <HStack frame={{ maxWidth: "infinity", height: 1 }} background={C.track}/>

    <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 8, bottom: 7 }}>
      <Text font={13} fontWeight="bold" foregroundStyle={C.primary}>策略 Top</Text>
      <Text font={10} foregroundStyle={C.tertiary} padding={{ leading: 7 }}>按本次运行累计流量</Text>
      <Spacer/>
      <Text font={10} foregroundStyle={C.tertiary}>引擎重启后归零</Text>
    </HStack>

    <VStack spacing={7} alignment="leading" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}>
      {policies.length ? policies.map(item => <PolicyRow key={item.name} item={item} maxWeight={maxWeight} barWidth={barWidth}/>) : <Text font={11} foregroundStyle={C.secondary}>暂无策略流量</Text>}
    </VStack>

    <HStack frame={{ maxWidth: "infinity" }} padding={{ top: 7 }}>
      <Text font={10} foregroundStyle={C.tertiary}>累计 counter · 引擎重启归零</Text>
      <Spacer/>
      <VersionLabel value={snapshot.buildLabel}/>
    </HStack>

    {!live && errorText ? <Text font={8} foregroundStyle={C.warn} lineLimit={1} padding={{ top: 2 }}>{errorText}</Text> : null}
  </VStack>
}
