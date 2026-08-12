import { Divider, HStack, Image, Spacer, Text, VStack, ZStack } from "scripting"
import { formatBytes, formatDetailBytes, formatMemory, formatUptime } from "../services/format"
import type { InterfaceTraffic, MetricsResult, MetricsSnapshot } from "../services/types"
import { C, EmptyState, Header, RateCard, StatusBlock, VersionLabel } from "./WidgetPrimitives"

type Props = { result: MetricsResult }

function snapshotOf(result: MetricsResult): MetricsSnapshot | null {
  return result.ok ? result.snapshot : result.cache || null
}

function interfaceInfo(name: string): { title: string; icon: string } {
  const value = String(name || "unknown")
  if (/^pdp_ip\d+$/i.test(value)) return { title: "蜂窝数据", icon: "antenna.radiowaves.left.and.right" }
  if (value === "en0") return { title: "Wi-Fi", icon: "wifi" }
  if (value === "lo0") return { title: "回环接口", icon: "arrow.triangle.2.circlepath" }
  if (/^awdl\d+$/i.test(value)) return { title: "Apple 直连", icon: "dot.radiowaves.left.and.right" }
  if (/^llw\d+$/i.test(value)) return { title: "低延迟无线", icon: "wave.3.right" }
  if (/^utun\d+$/i.test(value)) return { title: "隧道", icon: "lock.shield" }
  if (/^bridge\d+$/i.test(value)) return { title: "网桥", icon: "point.3.connected.trianglepath.dotted" }
  return { title: value, icon: "network" }
}

function DirectionValue({ direction, value }: { direction: "down" | "up"; value: number }) {
  const down = direction === "down"
  return <HStack
    spacing={4}
    alignment="center"
    frame={{ maxWidth: "infinity", alignment: down ? "leading" : "trailing" }}
  >
    {down ? <Image systemName="arrow.down" resizable scaleToFit foregroundStyle={C.down} frame={{ width: 9, height: 9 }}/> : null}
    <Text font={11} fontWeight="semibold" fontDesign="rounded" foregroundStyle={C.primary} lineLimit={1}>{formatDetailBytes(value, 1)}</Text>
    {!down ? <Image systemName="arrow.up" resizable scaleToFit foregroundStyle={C.up} frame={{ width: 9, height: 9 }}/> : null}
  </HStack>
}

function TrafficComposition({ item }: { item: InterfaceTraffic }) {
  const segments = 20
  const downCount = item.totalBytes > 0
    ? Math.max(0, Math.min(segments, Math.round(item.inBytes / item.totalBytes * segments)))
    : 0
  return <HStack spacing={2} alignment="center" frame={{ maxWidth: "infinity", height: 5, alignment: "center" }}>
    {Array.from({ length: segments }, (_, index) => <HStack
      key={String(index)}
      frame={{ width: 13.7, height: 5 }}
      background={item.totalBytes <= 0 ? C.track : index < downCount ? C.down : C.up}
      clipShape={{ type: "capsule" }}
    />)}
  </HStack>
}

function InterfaceDetail({ item }: { item: InterfaceTraffic }) {
  const info = interfaceInfo(item.name)
  return <VStack spacing={5} alignment="leading" frame={{ maxWidth: "infinity" }}>
    <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
      <HStack spacing={7} alignment="center">
        <Image systemName={info.icon} resizable scaleToFit foregroundStyle={C.accent} frame={{ width: 15, height: 15 }}/>
        <Text font={12} fontWeight="semibold" foregroundStyle={C.primary} lineLimit={1}>{info.title}</Text>
      </HStack>
      <Spacer/>
      <Text font={12} fontWeight="bold" fontDesign="rounded" foregroundStyle={C.primary} lineLimit={1}>{formatDetailBytes(item.totalBytes, 1)}</Text>
    </HStack>
    <HStack spacing={0} alignment="center" frame={{ maxWidth: "infinity" }}>
      <DirectionValue direction="down" value={item.inBytes}/>
      <DirectionValue direction="up" value={item.outBytes}/>
    </HStack>
    <TrafficComposition item={item}/>
  </VStack>
}

export function LargeWidgetView({ result }: Props) {
  const snapshot = snapshotOf(result)
  const live = result.ok
  const errorText = result.ok ? "" : result.error.message

  if (!snapshot) {
    return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} widgetBackground={C.bg}>
      <EmptyState title={result.ok ? "暂无数据" : "尚未配置"} detail={result.ok ? "等待下一次刷新" : errorText || "打开脚本填写 Surge HTTP API"}/>
    </ZStack>
  }

  const interfaces = (snapshot.interfaces || []).slice(0, 3)
  const down = formatBytes(snapshot.totalInBytes)
  const up = formatBytes(snapshot.totalOutBytes)
  const mem = formatMemory(snapshot.memoryBytes)
  const active = snapshot.activeRequests == null ? "—" : String(Math.round(snapshot.activeRequests))
  const dns = snapshot.dnsCacheEntries == null ? "—" : String(Math.round(snapshot.dnsCacheEntries))
  const uptime = formatUptime(snapshot.uptimeSeconds)
  const bans = snapshot.activeBans == null ? 0 : Math.max(0, Math.round(snapshot.activeBans))

  return <VStack spacing={0} alignment="leading" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }} padding={{ horizontal: 18, top: 18, bottom: 8 }} widgetBackground={C.bg}>
    <Header fetchedAt={snapshot.fetchedAt} cached={!live} inset={8} titleFont={12}/>

    <HStack spacing={9} alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 10 }}>
      <RateCard icon="arrow.down.circle.fill" label="累计下行" value={down} color={C.down}/>
      <HStack frame={{ width: 1, height: 43 }} background={C.track}/>
      <RateCard icon="arrow.up.circle.fill" label="累计上行" value={up} color={C.up}/>
    </HStack>

    <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 9, bottom: 8 }}>
      <StatusBlock icon="cpu" label="内存占用" value={mem} color={C.accent}/>
      <Spacer/>
      <StatusBlock icon="link" label="活跃请求" value={active} color={C.accent}/>
      <Spacer/>
      <StatusBlock icon="globe" label="DNS 缓存" value={dns} color={C.accent}/>
      <Spacer/>
      <StatusBlock icon="clock" label="运行时长" value={uptime} color={C.accent}/>
    </HStack>

    <Divider padding={{ horizontal: 8, top: 2 }}/>

    <VStack spacing={8} alignment="leading" frame={{ maxWidth: "infinity" }} padding={{ horizontal: 8, top: 11 }}>
      {interfaces.length
        ? interfaces.map(item => <InterfaceDetail key={item.name} item={item}/>)
        : <Text font={11} foregroundStyle={C.secondary} padding={{ vertical: 12 }}>暂无接口流量</Text>}
    </VStack>

    {bans > 0 ? <HStack spacing={5} alignment="center" padding={{ top: 7 }}>
      <Image systemName="exclamationmark.triangle.fill" foregroundStyle={C.warn} frame={{ width: 10, height: 10 }}/>
      <Text font={9} fontWeight="semibold" foregroundStyle={C.warn}>未授权访问封禁 {bans}</Text>
    </HStack> : null}

    <Spacer/>
    <HStack frame={{ maxWidth: "infinity" }} padding={{ top: 5, trailing: 8 }}>
      <Spacer/>
      <VersionLabel value={snapshot.buildLabel} font={10}/>
    </HStack>

    {!live && errorText ? <Text font={8} foregroundStyle={C.warn} lineLimit={1} padding={{ top: 2 }}>{errorText}</Text> : null}
  </VStack>
}
