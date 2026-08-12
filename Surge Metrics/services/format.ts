export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 0 : digits)
  return `${text} ${units[unit]}`
}

export function formatDetailBytes(bytes: number | null | undefined, digits = 2): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  if (unit === 0) return `${Math.round(value)} ${units[unit]}`
  const digitsForUnit = unit === 1 ? Math.min(1, digits) : digits
  return `${value.toFixed(digitsForUnit)} ${units[unit]}`
}

export function formatMemory(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—"
  return formatBytes(bytes, bytes >= 100 * 1024 * 1024 ? 0 : 1)
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const total = Math.floor(seconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`
  return `${minutes}m`
}

export function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"

  const now = new Date()
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return `${hour}:${minute}`

  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}/${day} ${hour}:${minute}`
}

export function formatFetchedAtWithSeconds(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const base = formatFetchedAt(iso)
  const second = String(date.getSeconds()).padStart(2, "0")
  return `${base}:${second}`
}

export function maskKey(key: string): string {
  const value = (key || "").trim()
  if (!value) return "未设置"
  if (value.length <= 6) return `${value.slice(0, 1)}…${value.slice(-1)}`
  return `${value.slice(0, 3)}…${value.slice(-3)}`
}
