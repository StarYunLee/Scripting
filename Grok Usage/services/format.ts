export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—"
  const rounded = Math.round(value)
  return `${rounded}%`
}

export function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) return "刚刚"
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`

  return date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatResetDate(resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return "—"
  const date = new Date(resetAtIso)
  if (Number.isNaN(date.getTime())) return "—"

  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${month}月${day}日 ${hour}:${minute}`
}
