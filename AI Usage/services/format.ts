export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

export function formatClampedPercent(
  value: number | null | undefined,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
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
  return date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export const formatSmallDate = formatFetchedAt;

export function formatRelativeResetAt(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = date.getTime() - Date.now();
  if (diffMs < 0) return "已重置";
  if (diffMs < 60_000) return "即将重置";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟后重置`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时后重置`;
  if (diffMs < 86_400_000 * 30) return `${Math.floor(diffMs / 86_400_000)} 天后重置`;
  return `${formatResetDate(iso)} 重置`;
}

export function formatResetDate(
  resetAtIso: string | null | undefined,
): string {
  if (!resetAtIso) return "—";
  const date = new Date(resetAtIso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}
