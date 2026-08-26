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

export function formatCountdown(resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return "—"
  const target = new Date(resetAtIso).getTime()
  if (Number.isNaN(target)) return "—"

  let remain = Math.max(0, target - Date.now())
  const days = Math.floor(remain / 86_400_000)
  remain -= days * 86_400_000
  const hours = Math.floor(remain / 3_600_000)
  remain -= hours * 3_600_000
  const minutes = Math.floor(remain / 60_000)

  const hh = String(hours).padStart(2, "0")
  const mm = String(minutes).padStart(2, "0")

  if (days > 0) return `${days}d ${hh}:${mm}`
  return `${hh}:${mm}`
}

export function resetCreditsSummary(
  available: number | null | undefined,
  expirations: string[] | null | undefined,
): { available: number | null; nearestExpiration: string | null } {
  const count = available == null || !Number.isFinite(available) ? null : Math.max(0, Math.floor(available))
  const parsed = (expirations || [])
    .map(value => ({ value, ms: new Date(value).getTime() }))
    .filter(item => Number.isFinite(item.ms))
    .sort((a, b) => a.ms - b.ms)
  const future = parsed.filter(item => item.ms > Date.now())
  const effective = count != null && parsed.length >= count ? Math.min(count, future.length) : count
  return { available: effective, nearestExpiration: effective === 0 ? null : future[0]?.value || null }
}

export function formatSmallDate(resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return "—"
  const date = new Date(resetAtIso)
  if (Number.isNaN(date.getTime())) return "—"

  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${month}月${day}日 ${hour}:${minute}`
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
