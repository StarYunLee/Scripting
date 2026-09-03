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

export function formatSmallRelativeFetchedAt(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`;
  return formatTimeOnly(iso);
}

const MINUTE_MS = 60_000;

function resetDiffMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return time - Date.now();
}

function resetDurationParts(diffMs: number): {
  days: number;
  hours: number;
  minutes: number;
} {
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
}

function fullResetDuration(diffMs: number): string {
  const { days, hours, minutes } = resetDurationParts(diffMs);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${Math.max(1, minutes)}分钟`;
}

export function formatRelativeResetAt(iso: string | null | undefined): string {
  const diffMs = resetDiffMs(iso);
  if (diffMs == null) return "—";
  if (diffMs < 0) return "已重置";
  if (diffMs < MINUTE_MS) return "即将重置";
  return `${fullResetDuration(diffMs)}后重置`;
}

export function formatSingleWindowResetAt(
  iso: string | null | undefined,
): string {
  const diffMs = resetDiffMs(iso);
  if (diffMs == null) return "—";
  if (diffMs < 0) return "已重置";
  if (diffMs < MINUTE_MS) return "即将重置";
  return fullResetDuration(diffMs);
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

export function formatTimeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatCompactDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function formatResetCountdown(iso: string | null | undefined): string {
  const diffMs = resetDiffMs(iso);
  if (diffMs == null || diffMs < 0) return "";
  if (diffMs < MINUTE_MS) return "1m";
  const { days, hours, minutes } = resetDurationParts(diffMs);
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function formatCompactRelativeResetAt(
  iso: string | null | undefined,
): string {
  return formatRelativeResetAt(iso);
}

export function formatResetDate(resetAtIso: string | null | undefined): string {
  return formatSmallDate(resetAtIso);
}
