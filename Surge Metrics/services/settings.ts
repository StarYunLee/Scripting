import type { ConnectionConfig, WidgetSettings } from "./types"

const SETTINGS_KEY = "surge_metrics_settings_v1"
const CONNECTION_KEY = "surge_metrics_connection_v1"
const SNAPSHOT_KEY = "surge_metrics_last_snapshot_v1"

declare const Storage: {
  get<T = unknown>(key: string): T | null
  set<T = unknown>(key: string, value: T): boolean
  remove?(key: string): void
}

const DEFAULT_SETTINGS: WidgetSettings = {
  reloadMinutes: 5,
}

const DEFAULT_CONNECTION: ConnectionConfig = {
  host: "127.0.0.1",
  port: 6171,
  apiKey: "",
  useTls: false,
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function getSettings(): WidgetSettings {
  try {
    const value = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY)
    if (!isObject(value)) return { ...DEFAULT_SETTINGS }
    return {
      reloadMinutes:
        typeof value.reloadMinutes === "number" && value.reloadMinutes >= 5
          ? Math.min(Math.floor(value.reloadMinutes), 360)
          : DEFAULT_SETTINGS.reloadMinutes,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function setSettings(patch: Partial<WidgetSettings>): WidgetSettings {
  const current = getSettings()
  const next: WidgetSettings = {
    reloadMinutes:
      typeof patch.reloadMinutes === "number" && patch.reloadMinutes >= 5
        ? Math.min(Math.floor(patch.reloadMinutes), 360)
        : current.reloadMinutes,
  }
  try {
    Storage.set(SETTINGS_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

export function getConnection(): ConnectionConfig {
  try {
    const value = Storage.get<Partial<ConnectionConfig>>(CONNECTION_KEY)
    if (!isObject(value)) return { ...DEFAULT_CONNECTION }
    const port = typeof value.port === "number" ? value.port : Number(value.port)
    return {
      host: typeof value.host === "string" && value.host.trim() ? value.host.trim() : DEFAULT_CONNECTION.host,
      port: Number.isFinite(port) && port > 0 && port < 65536 ? Math.floor(port) : DEFAULT_CONNECTION.port,
      apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
      useTls: value.useTls === true,
    }
  } catch {
    return { ...DEFAULT_CONNECTION }
  }
}

export function setConnection(patch: Partial<ConnectionConfig>): ConnectionConfig {
  const current = getConnection()
  const portRaw = patch.port != null ? Number(patch.port) : current.port
  const next: ConnectionConfig = {
    host: typeof patch.host === "string" && patch.host.trim() ? patch.host.trim() : current.host,
    port: Number.isFinite(portRaw) && portRaw > 0 && portRaw < 65536 ? Math.floor(portRaw) : current.port,
    apiKey: typeof patch.apiKey === "string" ? patch.apiKey : current.apiKey,
    useTls: typeof patch.useTls === "boolean" ? patch.useTls : current.useTls,
  }
  try {
    Storage.set(CONNECTION_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

export function metricsUrl(connection = getConnection()): string {
  const scheme = connection.useTls ? "https" : "http"
  const host = connection.host.trim() || "127.0.0.1"
  const port = connection.port || 6171
  const key = encodeURIComponent(connection.apiKey || "")
  return `${scheme}://${host}:${port}/v1/metrics?x-key=${key}`
}

export function baseUrl(connection = getConnection()): string {
  const scheme = connection.useTls ? "https" : "http"
  const host = connection.host.trim() || "127.0.0.1"
  const port = connection.port || 6171
  return `${scheme}://${host}:${port}`
}

export function getCachedSnapshot<T = unknown>(): T | null {
  try {
    return Storage.get<T>(SNAPSHOT_KEY)
  } catch {
    return null
  }
}

export function setCachedSnapshot(value: unknown): void {
  try {
    Storage.set(SNAPSHOT_KEY, value)
  } catch {
    /* ignore */
  }
}

export function clearCache(): void {
  try {
    Storage.remove?.(SNAPSHOT_KEY)
  } catch {
    /* ignore */
  }
}
