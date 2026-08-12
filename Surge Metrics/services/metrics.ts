import {
  baseUrl,
  getCachedSnapshot,
  getConnection,
  getSettings,
  metricsUrl,
  setCachedSnapshot,
} from "./settings"
import type {
  ConnectionConfig,
  MetricSample,
  MetricsResult,
  MetricsSnapshot,
  PolicyTraffic,
} from "./types"

const BUILTIN_POLICY_RE = /^(DIRECT|REJECT|REJECT-DROP|REJECT-TINYGIF|REJECT-NO-DROP|REJECT-IMG|REJECT-VIDEO|REJECT-DICT|REJECT-ARRAY|Auto\s*Test)$/i

function debug(event: string, data: Record<string, unknown> = {}): void {
  try { console.log(`[Surge Metrics] ${event} ${JSON.stringify(data)}`) } catch { /* ignore */ }
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
    policyIn: {},
    policyOut: {},
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
      case "surge_interface_in_bytes_total": sample.interfaceInBytes += value; break
      case "surge_interface_out_bytes_total": sample.interfaceOutBytes += value; break
      case "surge_policy_in_bytes_total": {
        const policy = labels.policy || "unknown"
        sample.policyIn[policy] = (sample.policyIn[policy] || 0) + value
        break
      }
      case "surge_policy_out_bytes_total": {
        const policy = labels.policy || "unknown"
        sample.policyOut[policy] = (sample.policyOut[policy] || 0) + value
        break
      }
    }
  }
  return sample
}

function isBuiltinPolicy(name: string): boolean {
  return BUILTIN_POLICY_RE.test(name.trim())
}

function buildSnapshot(curr: MetricSample): MetricsSnapshot {
  const settings = getSettings()
  const names = new Set([...Object.keys(curr.policyIn), ...Object.keys(curr.policyOut)])
  const policies: PolicyTraffic[] = []
  for (const name of names) {
    if (settings.hideBuiltInPolicies && isBuiltinPolicy(name)) continue
    const totalBytes = (curr.policyIn[name] || 0) + (curr.policyOut[name] || 0)
    policies.push({ name, totalBytes })
  }
  policies.sort((a, b) => b.totalBytes - a.totalBytes)

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
    topPolicies: policies.slice(0, 5),
  }
}

async function fetchMetricsText(connection: ConnectionConfig): Promise<
  { ok: true; text: string } |
  { ok: false; status?: number; message: string; detail?: string }
> {
  try {
    const response = await fetch(metricsUrl(connection), {
      method: "GET",
      headers: { Accept: "text/plain, */*", "X-Key": connection.apiKey },
      timeout: 12,
      privilegeLabel: "SurgeMetrics",
    } as RequestInit & { timeout?: number; privilegeLabel?: string })
    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: response.status === 401 || response.status === 403
          ? "API Key 无效或无权限"
          : `请求失败 HTTP ${response.status}`,
        detail: text.slice(0, 200),
      }
    }
    if (!text.includes("surge_")) {
      return { ok: false, message: "响应不是有效的 Surge metrics", detail: text.slice(0, 200) }
    }
    return { ok: true, text }
  } catch (error) {
    return {
      ok: false,
      message: "无法连接 Surge HTTP API",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchMetrics(): Promise<MetricsResult> {
  const connection = getConnection()
  const cache = getCachedSnapshot<MetricsSnapshot>()
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
      policies: snapshot.topPolicies.length,
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
    detail: `uptime=${sample.uptimeSeconds ?? "—"}s mem=${sample.memoryBytes ?? "—"} policies=${Object.keys(sample.policyIn).length}`,
  }
}

export function getCachedMetrics(): MetricsSnapshot | null {
  return getCachedSnapshot<MetricsSnapshot>()
}