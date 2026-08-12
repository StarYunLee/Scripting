import { HStack, Spacer, Text, VStack, ZStack } from "scripting"
import { formatBytes, formatMemory, formatUptime } from "../services/format"
import type { MetricsResult, MetricsSnapshot } from "../services/types"
import { C, EmptyState, Header, RateCard, StatusBlock, VersionLabel } from "./WidgetPrimitives"

type Props = { result: MetricsResult }

function snapshotOf(result: MetricsResult): MetricsSnapshot | null {
  return result.ok ? result.snapshot : result.cache || null
}

export function MediumWidgetView({ result }: Props) {
  const snapshot = snapshotOf(result)
  const live = result.ok
  const errorText = result.ok ? "" : result.error.message

  if (!snapshot) {
    return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
      <EmptyState title={result.ok ? "暂无数据" : "尚未配置"} detail={result.ok ? "等待下一次刷新" : errorText || "打开脚本填写 Surge HTTP API"}/>
    </ZStack>
  }

  const down = formatBytes(snapshot.totalInBytes)
  const up = formatBytes(snapshot.totalOutBytes)
  const mem = formatMemory(snapshot.memoryBytes)
  const active = snapshot.activeRequests == null ? "—" : String(Math.round(snapshot.activeRequests))
  const dns = snapshot.dnsCacheEntries == null ? "—" : String(Math.round(snapshot.dnsCacheEntries))
  const uptime = formatUptime(snapshot.uptimeSeconds)
  const bans = snapshot.activeBans == null ? 0 : Math.max(0, Math.round(snapshot.activeBans))

  return <VStack spacing={0} alignment="leading" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ horizontal: 14, vertical: 11 }} widgetBackground={C.bg}>
    <Header fetchedAt={snapshot.fetchedAt} cached={!live}/>

    <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 8 }}>
      <RateCard icon="arrow.down.circle.fill" label="累计下行" value={down} color={C.down}/>
      <HStack frame={{ width: 1, height: 43 }} background={C.track}/>
      <RateCard icon="arrow.up.circle.fill" label="累计上行" value={up} color={C.up}/>
    </HStack>

    <HStack frame={{ maxWidth: "infinity", height: 1 }} background={C.track}/>

    <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 6, bottom: 5 }}>
      <StatusBlock icon="cpu" label="内存占用" value={mem} color={C.accent}/>
      <Spacer/>
      <StatusBlock icon="link" label="活跃请求" value={active}/>
      <Spacer/>
      <StatusBlock icon="globe" label="DNS 缓存" value={dns}/>
      <Spacer/>
      <StatusBlock icon="clock" label="运行时长" value={uptime}/>
    </HStack>

    <HStack frame={{ maxWidth: "infinity", height: 1 }} background={C.track}/>

    <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 5 }}>
      {bans > 0
        ? <Text font={9} fontWeight="bold" foregroundStyle={C.warn}>未授权封禁 {bans}</Text>
        : <Text font={9} foregroundStyle={C.tertiary}>引擎累计 · 重启归零</Text>}
      <Spacer/>
      <VersionLabel value={snapshot.buildLabel}/>
    </HStack>

    {!live && errorText ? <Text font={8} foregroundStyle={C.warn} lineLimit={1} padding={{ top: 2 }}>{errorText}</Text> : null}
  </VStack>
}
