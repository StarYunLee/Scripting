export type ConnectionConfig = {
  /** e.g. 127.0.0.1 or 192.168.1.1 */
  host: string
  /** HTTP API port, e.g. 6171 */
  port: number
  /** HTTP API key (same as http-api key) */
  apiKey: string
  /** use https when http-api-tls = true */
  useTls: boolean
}

export type WidgetSettings = {
  reloadMinutes: number
}

export type MetricSample = {
  fetchedAt: string
  uptimeSeconds: number | null
  memoryBytes: number | null
  activeRequests: number | null
  dnsCacheEntries: number | null
  activeBans: number | null
  build: {
    version: string | null
    build: string | null
  }
  /** cumulative in/out across exposed interfaces */
  interfaceInBytes: number
  interfaceOutBytes: number
  /** cumulative in/out bytes grouped by exposed interface label */
  interfaceIn: Record<string, number>
  interfaceOut: Record<string, number>
}

export type InterfaceTraffic = {
  name: string
  inBytes: number
  outBytes: number
  totalBytes: number
}

export type MetricsSnapshot = {
  fetchedAt: string
  uptimeSeconds: number | null
  memoryBytes: number | null
  activeRequests: number | null
  dnsCacheEntries: number | null
  activeBans: number | null
  buildLabel: string
  /** cumulative interface counters since the Surge engine started */
  totalInBytes: number
  totalOutBytes: number
  interfaces: InterfaceTraffic[]
}

export type MetricsErrorCode =
  | "missing_config"
  | "http_error"
  | "network_error"
  | "invalid_metrics"
  | "unknown"

export type MetricsError = {
  code: MetricsErrorCode
  message: string
  detail?: string
}

export type MetricsResult =
  | { ok: true; snapshot: MetricsSnapshot }
  | { ok: false; error: MetricsError; cache?: MetricsSnapshot | null }
