import {
  baseUrl,
  getCachedSnapshot,
  getConnection,
  metricsUrl,
  setCachedSnapshot,
} from "./settings"
import type {
  ConnectionConfig,
  InterfaceTraffic,
  MetricSample,
  MetricsResult,
  MetricsSnapshot,
} from "./types"

function debug(event: string, data: Record<string, unknown> = {}): void {
  try { console.log(`[Surge Metrics] ${event} ${JSON.stringify(data)}`) } catch { /* ignore */ }
}

function redactDetail(value: unknown, connection: ConnectionConfig): string {
  let detail = value instanceof Error ? value.message : String(value)
  const key = connection.apiKey.trim()
  if (key) detail = detail.split(key).join("[REDACTED]")
  return detail.replace(/([?&]x-key=)[^&\s]+/gi, "$1[REDACTED]")
}

function parseLabels(raw: string): Record<string, string> {
  const labels: Record<string, string> = {}
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    labels[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
  return labels
}

function parseNumber(raw: string): number | null {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** Parse Surge's Prometheus text exposition. */
export function parsePrometheusText(text: string, fetchedAtMs = Date.now()): MetricSample {
  const sample: MetricSample = {
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    uptimeSeconds: null,
    memoryBytes: null,
    activeRequests: null,
    dnsCacheEntries: null,
    activeBans: null,
    build: { version: null, build: null },
    interfaceInBytes: 0,
    interfaceOutBytes: 0,
    interfaceIn: {},
    interfaceOut: {},
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)
    if (!match) continue
    const name = match[1]
    const labels = parseLabels(match[2] || "")
    const value = parseNumber(match[3])
    if (value == null) continue

    switch (name) {
      case "surge_uptime_seconds": sample.uptimeSeconds = value; break
      case "surge_memory_bytes": sample.memoryBytes = value; break
      case "surge_active_requests": sample.activeRequests = value; break
      case "surge_dns_cache_entries": sample.dnsCacheEntries = value; break
      case "surge_active_bans": sample.activeBans = value; break
      case "surge_build_info":
        sample.build = { version: labels.version || null, build: labels.build || null }
        break
      case "surge_interface_in_bytes_total": {
        const name = labels.interface || "unknown"
        sample.interfaceInBytes += value
        sample.interfaceIn[name] = (sample.interfaceIn[name] || 0) + value
        break
      }
      case "surge_interface_out_bytes_total": {
        const name = labels.interface || "unknown"
        sample.interfaceOutBytes += value
        sample.interfaceOut[name] = (sample.interfaceOut[name] || 0) + value
        break
      }
    }
  }
  return sample
}

function buildSnapshot(curr: MetricSample): MetricsSnapshot {
  const names = new Set([...Object.keys(curr.interfaceIn), ...Object.keys(curr.interfaceOut)])
  const interfaces: InterfaceTraffic[] = [...names].map(name => {
    const inBytes = curr.interfaceIn[name] || 0
    const outBytes = curr.interfaceOut[name] || 0
    return { name, inBytes, outBytes, totalBytes: inBytes + outBytes }
  }).sort((a, b) => b.totalBytes - a.totalBytes)

  const version = curr.build.version || "—"
  return {
    fetchedAt: curr.fetchedAt,
    uptimeSeconds: curr.uptimeSeconds,
    memoryBytes: curr.memoryBytes,
    activeRequests: curr.activeRequests,
    dnsCacheEntries: curr.dnsCacheEntries,
    activeBans: curr.activeBans,
    buildLabel: curr.build.build ? `Surge ${version} • Build ${curr.build.build}` : `Surge ${version}`,
    totalInBytes: curr.interfaceInBytes,
    totalOutBytes: curr.interfaceOutBytes,
    interfaces,
  }
}

async function fetchMetricsText(connection: ConnectionConfig): Promise<
  { ok: true; text: string } |
  { ok: false; status?: number; message: string; detail?: string }
> {
  try {
    const requestUrl = `${metricsUrl(connection)}&refresh=${Date.now()}`
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "text/plain, */*",
        "X-Key": connection.apiKey,
        "Cache-Control": "no-cache, no-store",
        Pragma: "no-cache",
      },
      timeout: 12,
      allowInsecureRequest: !connection.useTls,
      debugLabel: "SurgeMetrics",
    })
    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: response.status === 401 || response.status === 403
          ? "API Key 无效或无权限"
          : `请求失败 HTTP ${response.status}`,
        detail: redactDetail(text.slice(0, 200), connection),
      }
    }
    if (!text.includes("surge_")) {
      return { ok: false, message: "响应不是有效的 Surge metrics", detail: redactDetail(text.slice(0, 200), connection) }
    }
    return { ok: true, text }
  } catch (error) {
    return {
      ok: false,
      message: "无法连接 Surge HTTP API",
      detail: redactDetail(error, connection),
    }
  }
}

export async function fetchMetrics(): Promise<MetricsResult> {
  const connection = getConnection()
  const cache = getCachedMetrics()
  if (!connection.apiKey.trim()) {
    return {
      ok: false,
      error: { code: "missing_config", message: "请先配置 HTTP API Key", detail: `当前地址 ${baseUrl(connection)}` },
      cache,
    }
  }

  debug("fetch.start", { host: connection.host, port: connection.port, useTls: connection.useTls })
  const result = await fetchMetricsText(connection)
  if (!result.ok) {
    debug("fetch.error", { message: result.message, status: result.status })
    return {
      ok: false,
      error: { code: result.status ? "http_error" : "network_error", message: result.message, detail: result.detail },
      cache,
    }
  }

  try {
    const snapshot = buildSnapshot(parsePrometheusText(result.text))
    setCachedSnapshot(snapshot)
    debug("fetch.ok", {
      interfaces: snapshot.interfaces.length,
      totalInBytes: snapshot.totalInBytes,
      totalOutBytes: snapshot.totalOutBytes,
      memoryBytes: snapshot.memoryBytes,
    })
    return { ok: true, snapshot }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_metrics",
        message: "解析 metrics 失败",
        detail: error instanceof Error ? error.message : String(error),
      },
      cache,
    }
  }
}

export async function testConnection(): Promise<{ ok: boolean; message: string; detail?: string }> {
  const connection = getConnection()
  if (!connection.apiKey.trim()) return { ok: false, message: "请先填写 API Key" }
  const result = await fetchMetricsText(connection)
  if (!result.ok) return { ok: false, message: result.message, detail: result.detail }
  const sample = parsePrometheusText(result.text)
  return {
    ok: true,
    message: `连通成功 · Surge ${sample.build.version || "unknown"}`,
    detail: `uptime=${sample.uptimeSeconds ?? "—"}s mem=${sample.memoryBytes ?? "—"} interfaces=${Object.keys(sample.interfaceIn).length}`,
  }
}

export function getCachedMetrics(): MetricsSnapshot | null {
  const value = getCachedSnapshot<MetricsSnapshot>()
  return value && Array.isArray(value.interfaces) ? value : null
}