export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

export function formatFetchedAt(iso: string | null | undefined): string {
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
  if (!resetAtIso) return "—";
  const date = new Date(resetAtIso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

function normalizePlanKey(value: string): string {
  return value
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/\+/g, "-plus")
    .toLowerCase();
}

function titleCaseWords(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** GitHub Copilot 套餐档位 */
export function formatPlanLabel(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const normalized = normalizePlanKey(value);
  const labels: { [key: string]: string } = {
    free: "Free",
    individual: "Individual",
    pro: "Pro",
    "pro-plus": "Pro+",
    proplus: "Pro+",
    business: "Business",
    enterprise: "Enterprise",
  };
  if (labels[normalized]) return labels[normalized];
  return titleCaseWords(value.trim());
}
