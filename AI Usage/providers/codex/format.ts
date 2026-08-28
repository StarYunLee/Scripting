export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded}%`;
}

export function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

export function formatRelativeFetchedAt(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`;
  return formatFetchedAt(iso);
}

export function formatRelativeResetAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = date.getTime() - Date.now();
  if (diffMs < 0) return "已重置";
  if (diffMs < 60_000) return "即将重置";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟后重置`;
  if (diffMs < 86_400_000)
    return `${Math.floor(diffMs / 3_600_000)} 小时后重置`;
  if (diffMs < 86_400_000 * 7) {
    return `${Math.floor(diffMs / 86_400_000)} 天后重置`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日重置`;
}

export function resetCreditsSummary(
  available: number | null | undefined,
  expirations: string[] | null | undefined,
): { available: number | null; nearestExpiration: string | null } {
  const count =
    available == null || !Number.isFinite(available)
      ? null
      : Math.max(0, Math.floor(available));
  const parsed = (expirations || [])
    .map((value) => ({ value, ms: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((a, b) => a.ms - b.ms);
  const future = parsed.filter((item) => item.ms > Date.now());
  const effective =
    count != null && parsed.length >= count
      ? Math.min(count, future.length)
      : count;
  return {
    available: effective,
    nearestExpiration: effective === 0 ? null : future[0]?.value || null,
  };
}

export function formatSmallDate(resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return "—";
  const date = new Date(resetAtIso);
  if (Number.isNaN(date.getTime())) return "—";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

export function formatResetDate(resetAtIso: string | null | undefined): string {
  return formatSmallDate(resetAtIso);
}
